var steem    = require('steem');


function checkAmount(reversal, reversal_price, steem_price, sbd_price) {
  console.log('checkReversalAmount func activated')
  let amount              = reversal.amount
  let currency            = reversal.currency
  let reversal_amount     = reversal.reversal_amount
  let reversal_currency   = reversal.reversal_currency
  
  let amount_usd          = reversal.currency == 'STEEM' ? amount * steem_price : amount * sbd_price
  let reversal_amount_usd = reversal_currency == 'STEEM' ? reversal_amount * steem_price : reversal_amount * sbd_price
  let reversal_price      = amount_usd * reversal_price
  let leftovers_usd       = reversal_amount_usd - reversal_price

  if (reversal_amount_usd == reversal_price) {
    console.log('reversal amount matches perfectly the reversal price')
  } else if (reversal_amount_usd > reversal_price) {
    console.log('reversal amount exceedes the price of the reversal, sending back leftovers: $' + leftovers_usd)
  } else {
    console.log('reversal request amount is below the reversal price, sending back funds')
  }
  return leftovers_usd
}

function reverseVote(reversal, retries, callback) {
  utils.log('Reversal func activated');
  steem.broadcast.vote(config.posting_key, account.name, reversal.author, reversal.permlink, 0, function (err, result) {
    if (!err && result) {
      utils.log('Vote reversed for: @' + reversal.author + '/' + reversal.permlink);

      if (callback)
        callback();
    } else {
      logError('Error reversing vote for: @' + reversal.author + '/' + reversal.permlink + ', Error: ' + err);

      // Try again on error
      if(retries < 2)
        setTimeout(function() { reverseVote(reversal, retries + 1, callback); }, 10000);
      else {
        utils.log('============= Vote reversal transaction failed three times for: @' + reversal.author + '/' + reversal.permlink + ' Reversal Amount: ' + reversal.reversal_amount + ' ' + reversal.reversal_currency + ' ===============');
        logFailedReversal(reversal, err);

        if (callback)
          callback();
      }
    }
  });
}

function sendReversalComment(reversal) {
  var content = null;

  if(config.rev_comment_location && config.rev_comment_location != '') {
    content = fs.readFileSync(config.rev_comment_location, "utf8");
  } else if (config.promotion_content && config.promotion_content != '') {
    content = config.promotion_content;
  }

  // If promotion content is specified in the config then use it to comment on the upvoted post
  if (content && content != '') {

    // Generate the comment permlink via steemit standard convention
    var permlink = 're-' + reversal.author.replace(/\./g, '') + '-' + reversal.permlink + '-' + new Date().toISOString().replace(/-|:|\./g, '').toLowerCase();

    // Replace variables in the promotion content
    // content = content.replace(/\{permlink\}/g, reversal.permlink)
    content = content.replace(/\{amount\}/g, reversal.amount)
    content = content.replace(/\{currency\}/g, reversal.currency)

    // Broadcast the comment
    steem.broadcast.comment(config.posting_key, reversal.author, reversal.permlink, account.name, permlink, permlink, content, '{"app":"postpromoter/' + version + '"}', function (err, result) {
      if (!err && result) {
        utils.log('Posted comment: ' + permlink);
      } else {
        logError('Error posting comment: ' + permlink);
      }
    });
  }
}

function logFailedReversal(reversal, message) {
  try {
    message = JSON.stringify(message);

    if (message.indexOf('assert_exception') >= 0 && message.indexOf('ERR_ASSERTION') >= 0)
      return;

    var failed_reversals = [];

    if(fs.existsSync("failed-reversals.json"))
      failed_reversals = JSON.parse(fs.readFileSync("failed-reversals.json"));

    reversal.error = message;
    failed_reversals.push(reversal);

    fs.writeFile('failed-reversals.json', JSON.stringify(failed_reversals), function (err) {
      if (err)
        utils.log('Error saving failed reversals to disk: ' + err);
    });
  } catch (err) {
    utils.log(err);
  }
}

module.exports = {
  checkAmount: checkAmount
}