
export async function setupBenchmarkSuite(suite, fireproof, connectBench) {

    // at page load time, prepare a database with 5 documents
    // sync this with our in-memory benchmark connector
    // this connector can be used downstream to sync databases into the 5 doc state
    let fiveDocDBConn = await prepareDatabase(fireproof, connectBench, 5)
    let fiftyDocDBConn = await prepareDatabase(fireproof, connectBench, 50)

    suite
        .add('Use Fireproof', function() {
            fireproof('benchmark-'+ Date.now())
        })
        .add("Use Fireproof and Put value", {
            defer: true,
            fn: async function (deferred) {
                const db = fireproof('benchmark'-+ Date.now())
                await db.put({_id: 'beyonce', name: 'Beyoncé', hitSingles: 29})
                deferred.resolve();
            }
        })
        .add('Sync 5 doc database', {
            defer: true,
            fn: async function (deferred) {
                let db = fireproof('benchmark-'+ Date.now())

                // create a connector which copies from the 5 doc db we initialized
                let benchConn = new connectBench(fiveDocDBConn)
                benchConn.connect(db.blockstore)

                // poll all docs until we have everything
                pollAllDocs(db, benchConn, 5, function () { deferred.resolve() }, null)
            }
        })
        .add('Sync 50 doc database', {
            defer: true,
            fn: async function (deferred) {
                let db = fireproof('benchmark-'+ Date.now())

                // create a connector which copies from the 50 doc db we initialized
                let benchConn = new connectBench(fiftyDocDBConn)
                benchConn.connect(db.blockstore)

                // poll all docs until we have everything
                pollAllDocs(db, benchConn, 50, function () { deferred.resolve() }, null)
            }
        })
}

async function prepareDatabase(fireproof, connectBench, n) {
    // create new db
    let db = fireproof('benchmark-'+ Date.now())

    // fill db
    for (let i = 0; i < n; i++) {
        await db.put({_id:`foo-${i}`, name: 'bar'})
    }

    // compact
    await db.compact()

    // sync via benchmark connector
    let conn = new connectBench()
    await conn.connect(db.blockstore)

    // create a check db that will refresh/poll
    // to determine when sync has completed
    let checkDB = fireproof('benchmark-check-'+ Date.now())
    let checkConn = new connectBench(conn)
    await checkConn.connect(checkDB.blockstore)

    return new Promise((resolve, reject) => {
        pollAllDocs(checkDB, checkConn, n, resolve, conn)
    })
}

function pollAllDocs(db, conn, n, resolve, retConn) {
    let alldocs = db.allDocs()
    alldocs.then((actualAllDocs) => {
        if (actualAllDocs.rows.length === n) {
            resolve(retConn)
        } else {
            conn.refresh()

            setTimeout(pollAllDocs, 100, db, conn, n, resolve, conn)
        }
    })
}
