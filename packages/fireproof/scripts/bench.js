import _ from 'lodash'
import Benchmark from 'benchmark'
import { fireproof } from '@fireproof/core/node'
import { ConnectBench} from "@fireproof/encrypted-blockstore";
import {setupBenchmarkSuite} from "../test/www/bench.js";

var suite = new Benchmark.Suite;

await setupBenchmarkSuite(suite, fireproof, ConnectBench)

suite
    .on('cycle', function(event) {
        console.log(String(event.target));
    })

suite.run({ 'async': true });
