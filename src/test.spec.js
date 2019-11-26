/* eslint-env mocha */
import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { isOLEDoc, decryptOLEDoc } from './index.js'
import jetpack from 'fs-jetpack'

chai.use(chaiAsPromised)

const { expect, assert } = chai

describe('Decrypting Password encrypted MS Office file', function () {
  this.timeout(10000)

  let testResources, wordDoc, excelDoc, pptDoc, nonEncrypted, secretDoc

  before('initialize', function () {
    testResources = jetpack.dir('test_resources')
    secretDoc = testResources.path('secret.docx')
    wordDoc = testResources.path('encrypted.docx')
    excelDoc = testResources.path('encrypted.xlsx')
    pptDoc = testResources.path('encrypted.pptx')
    nonEncrypted = testResources.path('nonEncrypted.docx')
  })

  it('Ole file (Word) with right password', async function () {
    const input = await jetpack.readAsync(wordDoc, 'buffer')
    assert.strictEqual(isOLEDoc(input), true)
    const output = await decryptOLEDoc(input, 'testtest')
    assert.strictEqual(isOLEDoc(output), false)
  })

  it('Ole file long password (test key padding)', async function () {
    const input = await jetpack.readAsync(secretDoc, 'buffer')
    assert.strictEqual(isOLEDoc(input), true)
    const output = await decryptOLEDoc(input, 'testpassword')
    assert.strictEqual(isOLEDoc(output), false)
  })

  it('Ole file (Excel) with right password', async function () {
    const input = await jetpack.readAsync(excelDoc, 'buffer')
    assert.strictEqual(isOLEDoc(input), true)
    const output = await decryptOLEDoc(input, 'test')
    assert.strictEqual(isOLEDoc(output), false)
  })

  it('Ole file (PowerPoint) with right password', async function () {
    const input = await jetpack.readAsync(pptDoc, 'buffer')
    assert.strictEqual(isOLEDoc(input), true)
    const output = await decryptOLEDoc(input, 'test')
    assert.strictEqual(isOLEDoc(output), false)
  })

  it('Ole file (Word) with wrong password', async function () {
    const input = await jetpack.readAsync(wordDoc, 'buffer')
    assert.strictEqual(isOLEDoc(input), true)
    await expect(decryptOLEDoc(input, 'testtes')).to.be.rejectedWith(Error).and.eventually.satisfy(error => {
      assert.strictEqual(error.id, 'WA_INVALID_DECRYPTED_FILE')
      assert.strictEqual(error.code, 'INVALID_DECRYPTED_FILE')
      assert.strictEqual(error.message, 'Decrypted file is not a valide OLE document')
      return true
    })
  })

  it('Not an Ole file', async function () {
    const input = await jetpack.readAsync(nonEncrypted, 'buffer')
    assert.strictEqual(isOLEDoc(input), false)
    const decryptedBuff = await decryptOLEDoc(input, 'testtest')
    assert.strictEqual(input.equals(decryptedBuff), true)
  })
})
