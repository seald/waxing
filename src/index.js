import { decryptOfficeFile, isOLEDoc, isZipFile } from './ooxml.js'
import WaxingError from './errors'

const decryptOLEDoc = async (buffer, password) => {
  if (isOLEDoc(buffer)) return decryptOfficeFile(buffer, password)
  else if (isZipFile(buffer)) return buffer
  else throw new WaxingError(WaxingError.INVALID_ENTRY_FILE)
}

export {
  isOLEDoc,
  decryptOLEDoc
}
