/*
Inspired by node-ole-doc, Copyright (c) 2012 Chris Geiersbach
https://github.com/atariman486/node-ole-doc
*/
import es from 'event-stream'

class Header {
  load (buffer) {
    let i
    for (i = 0; i < 8; i++) {
      if (Header.ole_id[i] !== buffer[i]) { return false }
    }

    this.secSize = 1 << buffer.readInt16LE(30) // Size of sectors
    this.shortSecSize = 1 << buffer.readInt16LE(32) // Size of short sectors
    this.SATSize = buffer.readInt32LE(44) // Number of sectors used for the Sector Allocation Table
    this.dirSecId = buffer.readInt32LE(48) // Starting Sec ID of the directory stream
    this.shortStreamMax = buffer.readInt32LE(56) // Maximum size of a short stream
    this.SSATSecId = buffer.readInt32LE(60) // Starting Sec ID of the Short Sector Allocation Table
    this.SSATSize = buffer.readInt32LE(64) // Number of sectors used for the Short Sector Allocation Table
    this.MSATSecId = buffer.readInt32LE(68) // Starting Sec ID of the Master Sector Allocation Table
    this.MSATSize = buffer.readInt32LE(72) // Number of sectors used for the Master Sector Allocation Table

    // The first 109 sectors of the MSAT
    this.partialMSAT = new Array(109)
    for (i = 0; i < 109; i++) { this.partialMSAT[i] = buffer.readInt32LE(76 + i * 4) }

    return true
  }
}

Header.ole_id = Buffer.from('D0CF11E0A1B11AE1', 'hex')

class AllocationTable {
  constructor (doc) {
    this._doc = doc
  }

  load (secIds) {
    this._table = new Array(secIds.length * (this._doc._header.secSize / 4))
    const buffer = this._doc._readSectors(secIds)
    let i
    for (i = 0; i < buffer.length / 4; i++) {
      this._table[i] = buffer.readInt32LE(i * 4)
    }
  }

  getSecIdChain (startSecId) {
    let secId = startSecId
    const secIds = []
    while (secId !== AllocationTable.SecIdEndOfChain) {
      secIds.push(secId)
      secId = this._table[secId]
    }

    return secIds
  }
}

AllocationTable.SecIdFree = -1
AllocationTable.SecIdEndOfChain = -2
AllocationTable.SecIdSAT = -3
AllocationTable.SecIdMSAT = -4

class DirectoryTree {
  constructor (doc) {
    this._doc = doc
  }

  load (secIds, callback) {
    const buffer = this._doc._readSectors(secIds)

    const count = buffer.length / 128
    this._entries = new Array(count)
    let i = 0
    for (i = 0; i < count; i++) {
      const offset = i * 128

      const nameLength = Math.max(buffer.readInt16LE(64 + offset) - 1, 0)

      const entry = {}
      // Slice length parity calculations are not necessary in Node.js, but are necessary to workaround
      // https://github.com/feross/buffer/issues/251 when Buffer is polyfilled in the browser
      entry.name = buffer.slice(offset, offset + (nameLength % 2 === 0 ? nameLength : nameLength - 1)).toString('utf16le')
      entry.type = buffer.readInt8(66 + offset)
      entry.nodeColor = buffer.readInt8(67 + offset)
      entry.left = buffer.readInt32LE(68 + offset)
      entry.right = buffer.readInt32LE(72 + offset)
      entry.storageDirId = buffer.readInt32LE(76 + offset)
      entry.secId = buffer.readInt32LE(116 + offset)
      entry.size = buffer.readInt32LE(120 + offset)

      this._entries[i] = entry
    }

    this.root = this._entries.find((entry) => {
      return entry.type === DirectoryTree.EntryTypeRoot
    })

    this._buildHierarchy(this.root)

    callback()
  }

  _buildHierarchy (storageEntry) {
    const childIds = this._getChildIds(storageEntry)

    storageEntry.storages = {}
    storageEntry.streams = {}
    childIds.forEach((childId) => {
      const childEntry = this._entries[childId]
      const name = childEntry.name
      if (childEntry.type === DirectoryTree.EntryTypeStorage) {
        storageEntry.storages[name] = childEntry
      }
      if (childEntry.type === DirectoryTree.EntryTypeStream) {
        storageEntry.streams[name] = childEntry
      }
    })

    for (const childStorageEntry in storageEntry.storages) {
      this._buildHierarchy(storageEntry.storages[childStorageEntry])
    }
  }

  _getChildIds (storageEntry) {
    const childIds = []

    const visit = (visitEntry) => {
      if (visitEntry.left !== DirectoryTree.Leaf) {
        childIds.push(visitEntry.left)
        visit(this._entries[visitEntry.left])
      }
      if (visitEntry.right !== DirectoryTree.Leaf) {
        childIds.push(visitEntry.right)
        visit(this._entries[visitEntry.right])
      }
    }

    if (storageEntry.storageDirId > -1) {
      childIds.push(storageEntry.storageDirId)
      const rootChildEntry = this._entries[storageEntry.storageDirId]
      visit(rootChildEntry)
    }

    return childIds
  }
}

DirectoryTree.EntryTypeEmpty = 0
DirectoryTree.EntryTypeStorage = 1
DirectoryTree.EntryTypeStream = 2
DirectoryTree.EntryTypeRoot = 5

DirectoryTree.NodeColorRed = 0
DirectoryTree.NodeColorBlack = 1

DirectoryTree.Leaf = -1

class Storage {
  constructor (doc, dirEntry) {
    this._doc = doc
    this._dirEntry = dirEntry
  }

  storage (storageName) {
    return new Storage(this._doc, this._dirEntry.storages[storageName])
  }

  stream (streamName) {
    const streamEntry = this._dirEntry.streams[streamName]
    if (!streamEntry) { return null }

    const doc = this._doc
    let bytes = streamEntry.size

    let allocationTable = doc._SAT
    let shortStream = false
    if (bytes < doc._header.shortStreamMax) {
      shortStream = true
      allocationTable = doc._SSAT
    }
    const secIds = allocationTable.getSecIdChain(streamEntry.secId)

    return es.readable(function (i, callback) {
      if (i >= secIds.length) {
        this.emit('end')
        return
      }

      const sectorCallback = (buffer) => {
        if (bytes - buffer.length < 0) {
          buffer = buffer.slice(0, bytes)
        }
        bytes -= buffer.length
        this.emit('data', buffer)
        callback()
      }

      if (shortStream) {
        const buffer = doc._readShortSector(secIds[i])
        sectorCallback(buffer)
      } else {
        const buffer = doc._readSector(secIds[i])
        sectorCallback(buffer)
      }
    })
  }
}

export default class OleCompoundDoc {
  constructor (fileBuffer) {
    this._fileBuffer = fileBuffer
    this.chunks = []
    this.read()
  }

  read () {
    this._read()
  }

  _read () {
    this._readHeader()
    this._readMSAT()
    this._readSAT()
    this._readSSAT()
    this._readDirectoryTree()
  }

  _readHeader () {
    const buffer = Buffer.alloc(512)
    this._header = new Header()
    this._fileBuffer.copy(buffer, 0, 0, 512) // TODO simplify
    if (!this._header.load(buffer)) {
      throw new Error('Not a valid compound document.')
    }
  }

  _readMSAT () {
    this._MSAT = this._header.partialMSAT.slice(0)
    this._MSAT.length = this._header.SATSize

    if (this._header.SATSize <= 109 || this._header.MSATSize === 0) {
      return
    }

    //  const buffer = Buffer.alloc(this._header.secSize)
    let currMSATIndex = 109
    let i = 0
    let secId = this._header.MSATSecId

    while (i < this._header.MSATSize) {
      const sectorBuffer = this._readSector(secId) // TODO: it should wait for the end of each callback ?
      let s
      for (s = 0; s < this._header.secSize - 4; s += 4) {
        if (currMSATIndex >= this._header.SATSize) { break } else { this._MSAT[currMSATIndex] = sectorBuffer.readInt32LE(s) }

        currMSATIndex++
      }

      secId = sectorBuffer.readInt32LE(this._header.secSize - 4)
      i++
    }
  }

  _readSector (secId) {
    return this._readSectors([secId])
  }

  _readSectors (secIds) {
    const buffer = Buffer.alloc(secIds.length * this._header.secSize)

    let i = 0
    while (i < secIds.length) {
      const bufferOffset = i * this._header.secSize
      const fileOffset = this._getFileOffsetForSec(secIds[i])
      this._fileBuffer.copy(buffer, bufferOffset, fileOffset, fileOffset + this._header.secSize)
      i++
    }

    return buffer
  }

  _readShortSector (secId) {
    return this._readShortSectors([secId])
  }

  _readShortSectors (secIds) {
    const buffer = Buffer.alloc(secIds.length * this._header.shortSecSize)

    let i = 0

    while (i < secIds.length) {
      const bufferOffset = i * this._header.shortSecSize
      const fileOffset = this._getFileOffsetForShortSec(secIds[i])
      this._fileBuffer.copy(buffer, bufferOffset, fileOffset, fileOffset + this._header.shortSecSize)
      i++
    }

    return buffer
  }

  _readSAT () {
    this._SAT = new AllocationTable(this)
    this._SAT.load(this._MSAT)
  }

  _readSSAT () {
    this._SSAT = new AllocationTable(this)
    const secIds = this._SAT.getSecIdChain(this._header.SSATSecId)
    if (secIds.length !== this._header.SSATSize) {
      throw new Error('Invalid Short Sector Allocation Table')
    }
    this._SSAT.load(secIds)
  }

  _readDirectoryTree () {
    this._directoryTree = new DirectoryTree(this)

    const secIds = this._SAT.getSecIdChain(this._header.dirSecId)
    this._directoryTree.load(secIds, () => {
      const rootEntry = this._directoryTree.root
      this._rootStorage = new Storage(this, rootEntry)
      this._shortStreamSecIds = this._SAT.getSecIdChain(rootEntry.secId)
    })
  }

  _getFileOffsetForSec (secId) {
    const secSize = this._header.secSize
    return (secId + 1) * secSize // Skip past the header sector
  }

  _getFileOffsetForShortSec (shortSecId) {
    const shortSecSize = this._header.shortSecSize
    const shortStreamOffset = shortSecId * shortSecSize

    const secSize = this._header.secSize
    const secIdIndex = Math.floor(shortStreamOffset / secSize)
    const secOffset = shortStreamOffset % secSize
    const secId = this._shortStreamSecIds[secIdIndex]

    return this._getFileOffsetForSec(secId) + secOffset
  }

  stream (streamName) {
    return this._rootStorage.stream(streamName)
  }
}
