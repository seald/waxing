import forge from 'node-forge'

const hashCalc = function (buff, algorithm) {
  if (algorithm === 'SHA512') return Buffer.from(forge.md.sha512.create().update(buff.toString('binary')).digest().data, 'binary')
  else return Buffer.from(forge.md.sha1.create().update(buff.toString('binary')).digest().data, 'binary')
}

const block3 = Buffer.from('FG4L56us0NY=', 'base64')

export const makeKeyFromPassword = function (password, saltValue, hashAlgorithm, encryptedKeyValue, spinValue, keyBits) {
  const passwordBuffer = Buffer.from(password, 'utf16le')
  const saltBuffer = Buffer.from(saltValue, 'binary')
  let hash = hashCalc(Buffer.concat([saltBuffer, passwordBuffer]), hashAlgorithm)

  for (let i = 0; i < spinValue; i++) {
    const buff = Buffer.alloc(4)
    buff.writeUInt32LE(i)
    hash = hashCalc(Buffer.concat([buff, hash]), hashAlgorithm)
  }

  const h2 = hashCalc(Buffer.concat([hash, block3]), hashAlgorithm)
  const key = h2.slice(0, Math.floor(keyBits / 8))

  const aes = forge.cipher.createDecipher('AES-CBC', forge.util.createBuffer(key))
  aes.start({ iv: forge.util.createBuffer(saltBuffer) })
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
  const length = Math.floor(newBuffer.length / SEGMENT_LENGTH)

  // Parallelize chunk decryption
  // Verify HMAC (encryptedVerifierHashInput, encryptedVerifierHashValue) ?
  for (let i = 0; i <= length; i++) {
    const buff = Buffer.alloc(4)
    buff.writeUInt32LE(i)
    const saltWithBlockKey = Buffer.concat([Buffer.from(keyDataSalt, 'binary'), buff])
    const iv = hashCalc(saltWithBlockKey, keyDataHashAlgorithm).slice(0, 16)
    const inter = newBuffer.slice(i * SEGMENT_LENGTH, (i + 1) * SEGMENT_LENGTH)
    const aes = forge.cipher.createDecipher('AES-CBC', forge.util.createBuffer(secretKey))
    aes.start({ iv: forge.util.createBuffer(iv) })
    aes.update(forge.util.createBuffer(inter))
    aes.finish(() => true) // Forge will not unpad if a callback return true...
    let dec = Buffer.from(aes.output.data, 'binary')
    if (remaining < inter.length) {
      dec = dec.slice(0, remaining)
    }
    outputBuffer = Buffer.concat([outputBuffer, dec])
    remaining -= inter.length
  }
  return outputBuffer
}
