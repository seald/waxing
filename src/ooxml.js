import fileType from 'file-type'
import xmldom from 'xmldom'
import { makeKeyFromPassword, decrypt } from './ecma376_agile.js'
import WaxingError from './errors.js'
import OleCompoundDoc from './oleFile.js'

// magic bytes that should be at the beginning of every OLE file:
const MAGIC_BYTES = Buffer.from('\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1', 'binary')

export const decryptOfficeFile = async (buffer, password) => {
  try {
    const doc = new OleCompoundDoc(buffer)
    const headerBuffer = await OLEStreamToBuffer(doc, 'EncryptionInfo')
    const encryptionType = parseEncryptionType(headerBuffer)
    if (encryptionType !== 'agile') throw new WaxingError(WaxingError.UNSUPPORTED_ENCRYPTION_INFO)
    const inputBuffer = await OLEStreamToBuffer(doc, 'EncryptedPackage')
    const info = parseInfoAgile(headerBuffer)
    const outputBuffer = await decrypt(loadKey(password, info), info.keyDataSalt, info.keyDataHashAlgorithm, inputBuffer)
    if (!(await isZipFile(outputBuffer))) throw new WaxingError(WaxingError.INVALID_DECRYPTED_FILE)
    return outputBuffer
  } catch (error) {
    if (error.message === 'Not a valid compound document.' || error.message === 'Invalid Short Sector Allocation Table') throw new WaxingError(WaxingError.INVALID_COMPOUND_FILE)
    else throw error
  }
}
/**
 * To workaround https://github.com/feross/buffer/issues/251 when Buffer is polyfilled in the browser
 * @param bytes
 * @returns {*}
 */
export const sliceOddLengthBuffer = bytes => {
  const length = bytes.length
  return length % 2 === 0 ? bytes : bytes.slice(0, length - 1)
}

// Re-do Buffer.from on MAGIC_BYTES only because tests load buffer polyfill dynamically and it causes errors if Buffer
// implementation is different when requiring and when executing, very ugly I know
export const isOLEDoc = (buffer) => buffer.slice(0, Buffer.from(MAGIC_BYTES).length).equals(Buffer.from(MAGIC_BYTES))

export const isZipFile = async (buffer) => {
  const fileExt = await fileType.fromBuffer(buffer)
  return Boolean(fileExt) && ['docx', 'xlsx', 'pptx', 'zip'].includes(fileExt.ext)
}

const OLEStreamToBuffer = (doc, streamName) => {
  const chunks = []
  return new Promise((resolve, reject) => {
    const stream = doc.stream(streamName)
    stream.on('data', (chunk) => {
      chunks.push(chunk)
    })
    stream.on('end', () => {
      resolve(Buffer.concat(chunks))
    })
    stream.on('error', (error) => reject(error))
  })
}

const parseEncryptionType = (buffer) => {
  const versionMajor = buffer.readUInt16LE(0)
  const versionMinor = buffer.readUInt16LE(2)
  if (versionMajor === 4 && versionMinor === 4) return 'agile'
  else return 'unsupported'
}

const parseInfoAgile = (buffer) => {
  const stringBuffer = buffer.toString('utf8')
  const Parser = xmldom.DOMParser
  const xml = new Parser().parseFromString(stringBuffer, 'text/xml')
  const keyDataSalt = Buffer.from(xml.getElementsByTagName('keyData')[0].getAttribute('saltValue'), 'base64').toString('binary')
  const keyDataHashAlgorithm = xml.getElementsByTagName('keyData')[0].getAttribute('hashAlgorithm')
  const passwordNode = xml.getElementsByTagNameNS('http://schemas.microsoft.com/office/2006/keyEncryptor/password', 'encryptedKey')[0]
  const spinValue = parseInt(passwordNode.getAttribute('spinCount'))
  const encryptedKeyValue = Buffer.from(passwordNode.getAttribute('encryptedKeyValue'), 'base64').toString('binary')
  const encryptedVerifierHashInput = Buffer.from(passwordNode.getAttribute('encryptedVerifierHashInput'), 'base64').toString('binary')
  const encryptedVerifierHashValue = Buffer.from(passwordNode.getAttribute('encryptedVerifierHashValue'), 'base64').toString('binary')
  const passwordSalt = Buffer.from(passwordNode.getAttribute('saltValue'), 'base64').toString('binary')
  const passwordHashAlgorithm = passwordNode.getAttribute('hashAlgorithm')
  const passwordKeyBits = parseInt(passwordNode.getAttribute('keyBits'))
  return {
    keyDataSalt,
    keyDataHashAlgorithm,
    spinValue,
    encryptedKeyValue,
    passwordSalt,
    passwordHashAlgorithm,
    passwordKeyBits,
    encryptedVerifierHashInput,
    encryptedVerifierHashValue
  }
}

const loadKey = (password, info) =>
  makeKeyFromPassword(
    password,
    info.passwordSalt,
    info.passwordHashAlgorithm,
    info.encryptedKeyValue,
    info.spinValue,
    info.passwordKeyBits
  )
