export const errors = {
  UNSUPPORTED_ENCRYPTION_INFO: {
    code: 'UNSUPPORTED_ENCRYPTION_INFO',
    message: 'This encryptioninfo version is unsupported'
  },
  INVALID_DECRYPTED_FILE: {
    code: 'INVALID_DECRYPTED_FILE',
    message: 'Decrypted file is not a valide OLE document'
  },
  INVALID_COMPOUND_FILE: {
    code: 'NOT_A_COMPOUND_FILE',
    message: 'The file is invalid'
  },
  INVALID_ENTRY_FILE: {
    code: 'INVALID_ENTRY_FILE',
    message: 'Invalid file'
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
