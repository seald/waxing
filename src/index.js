import { decryptOfficeFile, isOLEDoc } from './ooxml.js'
import "@babel/polyfill"

const decryptOLEDoc = async (buffer, passwordCallback) => {
  if (!isOLEDoc(buffer)) return buffer
  else return decryptOfficeFile(buffer, passwordCallback)
}

export {
  isOLEDoc,
  decryptOLEDoc
}
