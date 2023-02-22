export default class Index {
  constructor (database, mapFun) {
    this.database = database
    this.mapFun = mapFun
  }

  updateIndex () {}

  //   advanceIndex ()) {}

  query (query) {
    return {
      rows: []
    }
  }
}
