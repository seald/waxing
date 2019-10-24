import ole from './oleFile'
import struct from 'python-struct'
import xmldom from 'xmldom'
import * as ECMA376Agile from './ecma376_agile.js'
import WaxingError from './errors'

const _ECD_SIGNATURE = 0
const _ECD_DISK_NUMBER = 1
const _ECD_DISK_START = 2
const _ECD_ENTRIES_THIS_DISK = 3
const _ECD_ENTRIES_TOTAL = 4
const _ECD_SIZE = 5
const _ECD_OFFSET = 6
const _ECD_COMMENT_SIZE = 7
const structEndArchive64Locator = '<4sLQL'
const stringEndArchive64Locator = 'PK\u0006\u0007'
const structEndArchive64 = '<4sQ2H2L4Q'
const stringEndArchive64 = 'PK\u0006\u0006'
const structEndArchive = '<4s4H2LH'
const stringEndArchive = 'PK\u0005\u0006'

export const decryptOfficeFile = async (buffer, getPasswordCallback) => {
  try {
    const doc = new ole.OleCompoundDoc(buffer)
    const headerBuffer = await OLEStreamToBuffer(doc, 'EncryptionInfo')
    const encryptionType = parseEncryptionType(headerBuffer)
    if (encryptionType !== 'agile') throw new WaxingError(WaxingError.UNSUPPORTED_ENCRYPTION_INFO)
    const inputBuffer = await OLEStreamToBuffer(doc, 'EncryptedPackage')
    const info = parseInfoAgile(headerBuffer)
    const password = await getPasswordCallback()
    const outputBuffer = await decrypt(inputBuffer, password, info)
    if (!isZipFile(outputBuffer)) throw new WaxingError(WaxingError.INVALID_DECRYPTED_FILE)
    return outputBuffer
  } catch (error) {
    if (error.message === 'Not a valid compound document.' || error.message === 'Invalid Short Sector Allocation Table') throw new WaxingError(WaxingError.INVALID_COMPOUND_FILE)
    else throw error
  }
}

export const isZipFile = (buffer) => {
  const fileSize = buffer.byteLength
  const sizeEndCentDir = struct.sizeOf(structEndArchive)
  const newBuffer = buffer.slice(fileSize - sizeEndCentDir, fileSize)
  if (newBuffer.length === sizeEndCentDir &&
    newBuffer.slice(0, 4).toString('base64') === Buffer.from(stringEndArchive).toString('base64') &&
    newBuffer.slice(newBuffer.length - 2, newBuffer.length).toString('base64') === Buffer.from('\u0000\u0000').toString('base64')) {
    const endrec = struct.unpack(structEndArchive, newBuffer)
    endrec.push(Buffer.from(''))
    endrec.push(fileSize - sizeEndCentDir)
    return _EndRecData64(buffer, -sizeEndCentDir, endrec)
  }
  const maxCommentStart = Math.max(fileSize - 65536 - sizeEndCentDir, 0)
  const newBufferBis = newBuffer.slice(0, maxCommentStart)
  const start = newBufferBis.toString('utf8').lastIndexOf(stringEndArchive.toString('utf8'))
  if (start >= 0) {
    const raceData = newBufferBis.slice(start, start + sizeEndCentDir)
    if (raceData.length !== sizeEndCentDir) return false
    const _endrec = struct.unpack(structEndArchive, raceData)
    const commentSize = _endrec[_ECD_COMMENT_SIZE]
    const comment = newBufferBis.slice(start + sizeEndCentDir, start + sizeEndCentDir + commentSize)
    _endrec.push(comment)
    _endrec.push(maxCommentStart + start)
    return _EndRecData64(newBufferBis, maxCommentStart + start - fileSize, _endrec)
  }
  return false
}

const OLEStreamToBuffer = (doc, streamName) => {
  const chunks = []
  return new Promise((resolve) => {
    const stream = doc.stream(streamName)
    stream.on('data', (chunk) => {
      chunks.push(chunk)
    })
    stream.on('end', () => {
      resolve(Buffer.concat(chunks))
    })
  })
}

const parseEncryptionType = (buffer) => {
  const versionMajor = struct.unpack('<HH', buffer.slice(0, 4))[0]
  const versionMinor = struct.unpack('<HH', buffer.slice(0, 4))[1]
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
  ECMA376Agile.makeKeyFromPassword(
    password,
    info.passwordSalt,
    info.passwordHashAlgorithm,
    info.encryptedKeyValue,
    info.spinValue,
    info.passwordKeyBits
  )

const decrypt = async (buffer, password, info) => ECMA376Agile.decrypt(loadKey(password, info), info.keyDataSalt, info.keyDataHashAlgorithm, buffer)

const _EndRecData64 = (fpin, offset, endrec) => {
  const sizeEndCentDir64 = struct.sizeOf(structEndArchive64)
  const sizeEndCentDir64Locator = struct.sizeOf(structEndArchive64Locator)
  const _a = fpin.slice(fpin.length + (offset - sizeEndCentDir64Locator), fpin.length) // error
  const data = _a.slice(0, sizeEndCentDir64Locator)
  if (data.length !== sizeEndCentDir64Locator) return endrec
  const [sig, diskno,, disks] = struct.unpack(structEndArchive64Locator, data)
  if (sig.toString('base64') !== stringEndArchive64Locator.toString('base64')) return endrec
  if (diskno !== 0 || disks !== 1) throw new Error('zipfiles that span multiple disks are not supported')
  const _data = fpin.slice(fpin.length + (offset - sizeEndCentDir64Locator - sizeEndCentDir64), fpin.length)
  const __data = _data.slice(0, sizeEndCentDir64)
  if (__data.length !== sizeEndCentDir64) return endrec
  const [_sig,,,, diskNum, diskDir, dircount, dircount2, dirsize, dirOffset] = struct.unpack(structEndArchive64, __data)
  if (sig.toString('base64') !== stringEndArchive64.toString('base64')) return endrec
  endrec[_ECD_SIGNATURE] = _sig
  endrec[_ECD_DISK_NUMBER] = diskNum
  endrec[_ECD_DISK_START] = diskDir
  endrec[_ECD_ENTRIES_THIS_DISK] = dircount
  endrec[_ECD_ENTRIES_TOTAL] = dircount2
  endrec[_ECD_SIZE] = dirsize
  endrec[_ECD_OFFSET] = dirOffset
  return endrec
}
