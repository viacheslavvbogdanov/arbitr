// const util = require('util');
const debug = require('debug')('http');
const fs = require('fs');
const _ = require('underscore');
//const Exchanges = require('crypto-exchange');
// Ex = Exchanges;

console.log('\033c'); // Clear screen
debug('booting' );

function fileName( filename ) {
    return 'data/'+filename+'.json';
}
function writeObject( filename, obj ) {
    const json = JSON.stringify(obj);
    fs.writeFileSync(filename, json, 'utf-8');
}

function readObject( filename ) {
    const rawdata = fs.readFileSync(filename);  
    return JSON.parse(rawdata);   
}

let d = {}; // data object

console.log(Object.keys(Exchanges));
// delete Exchanges['kraken']; //Some API issues
d.exchangeNames = Object.keys(Exchanges);
// Exchanges['bitfinex'].ticker('BTC_USD')
//     .then(console.log)
// Exchanges['gdax'].ticker('BTC_USD')
//     .then(console.log)
// Exchanges.assets()
//     .then(console.log)

// let ts = [];
// _.each( d.exchangeNames, (name) => {
//     ts.push(Exchanges[name].ticker('ETH_BTC'));
// });
//
// Promise.all(ts).then( console.log, console.log);

// _.each( d.exchangeNames, (name) => {
//     Exchanges[name].pairs()
//     .then(
//         (data)=>{console.log(name, data)},
//         (name)=>{console.log(name, 'error')})
// });

//  Exchanges.pairs().then((pairs) => {
//     console.log(pairs);
//     console.log('OK');

//     _.each( pairs, (ex, name) => {
//         if (ex.length>1)
//             console.log( ex, name);
//         // console.log( name, pairs[name].length);
//     });
// }, console.log);

function getAllTickers() {
    d.tr = {};
    _.each( d.exchangeNames, (name) => {
        Ex[name].pairs().then( (pairs) => {
            console.log( name, pairs.length, 'pairs' );
            // console.log( name, pairs );
            Ex[name].ticker( pairs ).then( (tickers)=>{
                console.log( name, 'Tickers received' );
                d.tr[name] = tickers;
                writeObject( fileName(name), tickers );
                // console.log( Object.keys(d.tr) );
                findMaxProfit();
            }, (error) => {
                console.log( 'Error getting tickers', name, error )
            } );
        }, console.log);
    });
}

function loadAllTickers() {
    d.tr = {};
    _.each( d.exchangeNames, (name) => {
        try {
            d.tr[name] = readObject( fileName(name) );
        } catch(e) { console.log(e.toString()) }
    });
    console.log( "\nTickers loaded:", Object.keys(d.tr) );
}

 getAllTickers();
// loadAllTickers(); findMaxProfit();

function findMaxProfit() {
    // Aggregate ticks
    ticks = {};
    _.each( d.exchangeNames, (exchangeName) => {
        arr = d.tr[exchangeName];
        agg = _.map( arr, function( num, pair ) {
            // console.log( num, pair );
            let v = ticks[pair];
            if (!v) v = {};
            let a = arr[pair];
            a['exchange'] = exchangeName;
            a['pair'] = pair;
            v[exchangeName] = arr[pair];
            ticks[pair] =  v; 
            return ticks[pair]; 
        });
    });
    // console.log( 'Aggregated', ticks );
    // console.log( 'BTC_USD', ticks['BTC_USD'] );

    // Find max difference
    _.each( ticks, (tick, pair) => {
        const exs = Object.keys(tick);
        if (exs.length>1) {
            // console.log( pair, exs);
            tickask = _.sortBy( tick, 'ask' ); 
            tickbid = _.sortBy( tick, 'bid' ); 
            // console.log( tick );
            const f = _.first( tickask );
            const l = _.last( tickbid );
            const dif = l.last/f.last*100-100; 
            const difb = l.bid/f.ask*100-100;
            // console.log( pair, f.exchange, l.exchange, difLast.toFixed(2) );
            ticks[pair].pair = pair;
            ticks[pair].exBuy = f.exchange;
            ticks[pair].exSell = l.exchange;
            ticks[pair].difLast = dif;
            ticks[pair].difBidAsk = difb;
            // console.log(ticks[pair]);
        } else delete ticks[pair];
    });
    // sticks = _.sortBy( ticks, 'difLast' );
    sticks = _.sortBy( ticks, 'difBidAsk' );
    // console.log(sticks);

    const tab="\t";
    console.log( '');
    console.log( 'Best pairs for', Object.keys(d.tr));
    _.each( sticks, (tick, name) => {
        const minvolume = Math.min( tick[tick.exBuy].volume, tick[tick.exSell].volume);
        if (minvolume>1 && tick.difBidAsk>0) {
            console.log( 
                tick.difLast.toFixed(2)+'%', tab,
                tick.difBidAsk.toFixed(2)+'%', tab,
                tick.pair, tab,
                tick.exBuy, '->',
                tick.exSell, tab,
                minvolume.toFixed(0) );
            // console.log( tick );
        }
    });
}


