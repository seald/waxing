import forge from 'node-forge'

const hashCalc = function (salt, algorithm) {
  if (algorithm === 'SHA512') return forge.md.sha512.create().update(salt, 'binary')
  else return forge.md.sha1.create().update(salt, 'binary')
}

export const makeKeyFromPassword = function (password, saltValue, hashAlgorithm, encryptedKeyValue, spinValue, keyBits) {
  let hash = hashCalc(saltValue + Buffer.from(password, 'utf16le').toString('binary'), hashAlgorithm)
  const block3 = Buffer.from('FG4L56us0NY=', 'base64').toString('binary')

  for (let i = 0; i < spinValue; i++) {
    const buff = Buffer.alloc(4)
    buff.writeUInt32LE(i)
    hash = hashCalc(buff.toString('binary') + hash.digest().data, hashAlgorithm)
  }

  const h2 = hashCalc(hash.digest().data + block3, hashAlgorithm)
  const key = h2.digest().data.slice(0, Math.floor(keyBits / 8))

  const aes = forge.cipher.createDecipher('AES-CBC', forge.util.createBuffer(key))
  aes.start({
    iv: forge.util.createBuffer(saltValue.toString('binary'))
  })
  aes.update(forge.util.createBuffer(encryptedKeyValue))
  aes.finish(() => true) // Forge will not unpad if a callback return true...
  // TODO: verifier le HMAC si il est donné dans les infos
  return aes.output.data
}

export const decrypt = function (secretKey, keyDataSalt, keyDataHashAlgorithm, buffer) {
  let remaining = buffer.readUInt32LE(0)
  const SEGMENT_LENGTH = 4096
  let outputBuffer = Buffer.alloc(0)
  const newBuffer = buffer.slice(8, buffer.length)

  // Parallelize chunk decryption
  // Verify HMAC (encryptedVerifierHashInput, encryptedVerifierHashValue) ?
  for (let i = 0; i <= Math.floor(newBuffer.length / SEGMENT_LENGTH); i++) {
    const buff = Buffer.alloc(4)
    buff.writeUInt32LE(i)
    const saltWithBlockKey = keyDataSalt + buff.toString('binary')
    const iv = hashCalc(saltWithBlockKey, keyDataHashAlgorithm)
    const _iv = Buffer.from(iv.digest().data, 'binary').slice(0, 16)
    const inter = newBuffer.slice(i * SEGMENT_LENGTH, (i + 1) * SEGMENT_LENGTH)
    const aes = forge.cipher.createDecipher('AES-CBC', forge.util.createBuffer(secretKey))
    aes.start({ iv: forge.util.createBuffer(_iv.toString('binary')) })
    aes.update(forge.util.createBuffer(inter.toString('binary')))
    aes.finish(() => true) // Forge will not unpad if a callback return true...
    let dec = Buffer.from(aes.output.data, 'binary')
    if (remaining < inter.length) {
      dec = Buffer.from(aes.output.data, 'binary').slice(0, remaining)
    }
    outputBuffer = Buffer.concat([outputBuffer, dec])
    remaining -= inter.length
  }
  return outputBuffer
}
