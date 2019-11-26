# Waxing

`waxing` is a JS packages that decrypts password-protected Office documents.

## `decryptOLEDoc(buffer: Buffer, password: String): Promise<Buffer>`

This function takes a Buffer representing a password-protected Office document, a String containing the password, and
returns a Buffer corresponding to the decrypted document.

In case the input Buffer corresponds to a non-encrypted Office document, it is returned as is.

In case the input Buffer is not an Office document at all, the promise is rejected with an Error.

## `isOLEDoc(buffer: Buffer): Boolean`

This function takes a Buffer, and returns a Boolean indicating whether or not this is an encrypted Office document.
