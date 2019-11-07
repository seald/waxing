import { decryptOfficeFile, isOLEDoc } from './ooxml.js'
import "@babel/polyfill"

const decryptOLEDoc = async (buffer, passwordCallback) => {
  if (isOLEDoc(buffer)) return decryptOfficeFile(buffer, passwordCallback)
  else return buffer
}

export {
  isOLEDoc,
  decryptOLEDoc
}
