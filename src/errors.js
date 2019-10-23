export const errors = {
  NOT_A_VALID_OLEFILE: {
    code: 'NOT_A_VALID_OLEFILE',
    message: 'The file is not a vaild ole file'
  },
  UNSUPPORTED_ENCRYPTIONINFO: {
    code: 'UNSUPPORTED_ENCRYPTIONINFO',
    message: 'This encryptioninfo version is unsupported'
  },
  NOT_A_ZIPFILE: {
    code: 'NOT_A_ZIPFILE',
    message: 'Can\'t encrypt with this password'
  },
  NOT_A_COMPOUND_FILE: {
    code: 'NOT_A_COMPOUND_FILE',
    message: 'The file is invalid'
  }
}

export default class WaxingError extends Error {
  constructor ({ message, code, id }) {
    super(`${id} — ${code} — ${message}`)
    this.message = message
    this.code = code
    this.id = id
  }
}

for (const key of Object.keys(errors)) {
  WaxingError[key] = errors[key]
  WaxingError[key].id = 'WA_' + key
}
