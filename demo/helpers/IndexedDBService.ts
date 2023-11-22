import { generateUniqueId } from './index'

export class IndexedDBService {
    public isConnected = false
    private readonly dbName = ''
    private db = null
    private readonly version = 2

    constructor (db, version) {
        if (!db) {
            throw new Error('Database name should be provided in constructor parameters!')
        }
        this.dbName = db
        this.version = version
    }

    public connect () {
        if (this.isConnected) {
            return Promise.resolve()
        }

        /*const deleteRequest = indexedDB.deleteDatabase(this.dbName)
        console.log('deleteRequest', deleteRequest)*/

        return new Promise<void>((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version)

            request.onerror = (event) => {
                this.isConnected = false
                console.error('Error opening database:', event.target.error)
                reject(event.target.error)
            }

            request.onsuccess = (event) => {
                this.isConnected = true
                this.db = event.target.result
                resolve()
            }

            request.onupgradeneeded = (event) => {
                this.db = event.target.result
                if (!this.db.objectStoreNames.contains('messages')) {
                    this.db.createObjectStore('messages', { keyPath: 'id' })
                }
            }
        })
    }

    public saveData (data, uid) {
        if (!this.db) {
            return Promise.reject('Database not initialized. Call connect first!')
        }

        return new Promise((resolve, reject) => {
            if (!this.db.objectStoreNames.contains('messages')) {
                console.error('Store \'messages\' is not contained')
            }
            const transaction = this.db.transaction('messages', 'readwrite')
            const store = transaction.objectStore('messages')

            data['uid'] = uid
            data['id'] = generateUniqueId()
            const request = store.add(data)

            request.onsuccess = (event) => {
                resolve(event.target.result)
            }

            request.onerror = (event) => {
                console.error('Error writing data to store', event.target.error)
                reject(event.target.error)
            }
        })
    }

    public getData (uid) {
        if (!this.db) {
            return Promise.reject('Database not initialized. Call connect first!')
        }

        return new Promise((resolve, reject) => {
            if (!this.db.objectStoreNames.contains('messages')) {
                reject('Store \'messages\' is not contained')
            }

            const transaction = this.db.transaction('messages', 'readonly')
            const objectStore = transaction.objectStore('messages')
            const records = []

            transaction.oncomplete = () => {
                resolve(records)
            }

            transaction.onerror = () => {
                reject('Error retrieving records')
            }

            const cursorRequest = objectStore.openCursor()

            cursorRequest.onsuccess = (event) => {
                const cursor = event.target.result
                if (cursor) {
                    const record = cursor.value
                    if (record.uid === uid) {
                        records.push(record)
                    }
                    cursor.continue()
                }
            }

            cursorRequest.onerror = () => {
                reject('Cursor error')
            }
        })
    }

    public close () {
        if (this.db) {
            this.db.close()
        }
    }
}
