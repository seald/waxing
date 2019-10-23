/* eslint-env mocha */
import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { isOLEDoc, decryptOLEDoc } from './index'
import jetpack from 'fs-jetpack'

chai.use(chaiAsPromised)

const { expect, assert } = chai

describe('Decrypting Password encrypted MS Office file', () => {
  let testResources, wordDoc, excelDoc, pptDoc, nonEncrypted

  before('initialize', () => {
    testResources = jetpack.dir('test_resources')
    wordDoc = testResources.path('encrypted.docx')
    excelDoc = testResources.path('encrypted.xlsx')
    pptDoc = testResources.path('encrypted.pptx')
    nonEncrypted = testResources.path('nonEncrypted.docx')
  })

  it('Ole file (Word) with right password', async function () {
    this.timeout(10000)
    const input = jetpack.read(wordDoc, 'buffer')
    assert.strictEqual(isOLEDoc(input), false)
    const output = await decryptOLEDoc(input, () => 'testtest')
    assert.strictEqual(!isOLEDoc(output), false)
  })

  it('Ole file (Excel) with right password', async function () {
    this.timeout(10000)
    const input = jetpack.read(excelDoc, 'buffer')
    assert.strictEqual(isOLEDoc(input), false)
    const output = await decryptOLEDoc(input, () => 'test')
    assert.strictEqual(!isOLEDoc(output), false)
  })

  it('Ole file (PowerPoint) with right password', async function () {
    this.timeout(10000)
    const input = jetpack.read(pptDoc, 'buffer')
    assert.strictEqual(isOLEDoc(input), false)
    const output = await decryptOLEDoc(input, () => 'test')
    assert.strictEqual(!isOLEDoc(output), false)
  })

  it('Ole file (Word) with wrong password', async function () {
    this.timeout(10000)
    const input = jetpack.read(wordDoc, 'buffer')
    assert.strictEqual(isOLEDoc(input), false)
    await expect(decryptOLEDoc(input, () => 'testtes')).to.be.rejectedWith(Error).and.eventually.satisfy(error => {
      assert.strictEqual(error.id, 'WA_NOT_A_ZIPFILE')
      assert.strictEqual(error.code, 'NOT_A_ZIPFILE')
      assert.strictEqual(error.message, 'Can\'t encrypt with this password')
      return true
    })
  })

  it.skip('Not an Ole file', async function () {
    this.timeout(10000)
    const input = jetpack.read(nonEncrypted, 'buffer')
    assert.strictEqual(!isOLEDoc(input), false)
    await expect(decryptOLEDoc(input, () => 'testtest')).to.be.rejectedWith(Error).and.eventually.satisfy(error => {
      assert.strictEqual(error.id, 'WA_NOT_A_COMPOUND_FILE')
      assert.strictEqual(error.code, 'NOT_A_COMPOUND_FILE')
      assert.strictEqual(error.message, 'The file is invalid')
      return true
    })
  })
})
