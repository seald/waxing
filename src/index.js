import { isZipFile, decryptOfficeFile } from './ooxml.js'

export const isOLEDoc = (buffer) => isZipFile(buffer)

export const decryptOLEDoc = async (buffer, passwordCallback) => {
  if (isOLEDoc(buffer)) return buffer
  else return decryptOfficeFile(buffer, passwordCallback)
}
