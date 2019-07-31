var steem  = require('steem')
var dsteem = require('dsteem')
var utils  = require('./utils.js');
var fs     = require('fs');
var config = JSON.parse(fs.readFileSync("config.json"));
var client = new dsteem.Client('https://anyx.io')

function checkAmount(bid_amount, reversal_amount, reversal_price, steem_price, sbd_price) {

  let _bid_amount       = parseFloat(bid_amount)
  let bid_currency      = utils.getCurrency(bid_amount)
  let _reversal_amount  = parseFloat(reversal_amount)
  let reversal_currency = utils.getCurrency(reversal_amount)
  
  let bid_usd         = bid_currency == 'STEEM' ? _bid_amount * steem_price : _bid_amount * sbd_price
  let reversal_usd    = reversal_currency == 'STEEM' ? _reversal_amount * steem_price : _reversal_amount * sbd_price
  let _reversal_price = bid_usd * reversal_price
  let leftovers_usd   = reversal_usd - _reversal_price

  if (reversal_usd == _reversal_price) {
    utils.log('reversal amount matches perfectly the reversal price')
  } else if (reversal_usd > _reversal_price) {
    utils.log('reversal amount exceedes the price of the reversal, sending back leftovers: $' + leftovers_usd)
  } else {
    utils.log('reversal request is missing ' + leftovers_usd + '$, sending back funds')
  }
  return leftovers_usd
}

function reverseVote(vote_to_reverse, pubkey, reversal_transfer, retries) {
  return new Promise((resolve, reject) => {
    let postURL  = vote_to_reverse.memo.startsWith('#') ? vote_to_reverse.memo.substring(1) : vote_to_reverse.memo
    let permlink = postURL.substr(postURL.lastIndexOf('/') + 1)
    const vote   = {
      'voter': config.account,
      'author': vote_to_reverse.from,
      'permlink': permlink,
      'weight': 0
    }
    console.log(vote)
    client.broadcast.vote(vote, dsteem.PrivateKey.fromString(config.posting_key))
    .then((res) => {
      utils.log('Vote reversed for: @' + vote_to_reverse.from + permlink);
      return resolve() 
    })
    .catch((err) => {
      utils.log('Error reversing vote for: @' + vote_to_reverse.from + permlink);
      let already_reversed_err = 'itr->vote_percent != o.weight: Your current vote on this comment is identical to this vote.'
      if (err = already_reversed_err) {
        let memo    = config.transfer_memos['already_reversed']
        memo        = memo.replace(/{postURL}/g, postURL)
        utils.log(memo)
        if (pubkey.length > 0) memo = steem.memo.encode(config.memo_key, pubkey, ('#' + memo))
        return client.broadcast.transfer({ amount: reversal_transfer.amount, from: config.account, to: reversal_transfer.from , memo: memo}, dsteem.PrivateKey.fromString(config.active_key))
      }
      console.log(err)
      // Try again on error
      if(retries < 2) setTimeout(() => { reverseVote(vote_to_reverse, retries + 1); }, 10000);
      else return reject(err)     
    })
  })
}

module.exports = {
  checkAmount: checkAmount,
  reverseVote: reverseVote
}