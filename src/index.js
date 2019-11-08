import { decryptOfficeFile, isOLEDoc } from './ooxml.js'
import { isZipFile } from './ooxml'
import WaxingError from './errors'

const decryptOLEDoc = async (buffer, passwordCallback) => {
  if (isOLEDoc(buffer)) return decryptOfficeFile(buffer, passwordCallback)
  else if (isZipFile(buffer)) return buffer
  else throw new WaxingError(WaxingError.INVALID_ENTRY_FILE)
}

export {
  isOLEDoc,
  decryptOLEDoc
}
