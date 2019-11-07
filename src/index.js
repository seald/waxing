import { isZipFile, decryptOfficeFile } from './ooxml.js'
import "@babel/polyfill"

export const isOLEDoc = (buffer) => isZipFile(buffer)

export const decryptOLEDoc = async (buffer, passwordCallback) => {
  if (isOLEDoc(buffer)) return buffer
  else return decryptOfficeFile(buffer, passwordCallback)
}
