
function checkReversalAmount(reversal, processed_bids) {
  console.log('checkReversalAmount func activated')
  var amount   = reversal.amount
  var currency = reversal.currency
  if (processed_bids && processed_bids.find(x => x.permlink == reversal.permlink)) {
    var price             = processed_bids.find(x => x.permlink == reversal.permlink).amount
    var accepted_currency = processed_bids.find(x => x.permlink == reversal.permlink).currency
    var accepted_price    = parseFloat(price * config.reversal_price).toFixed(3)
    console.log('prices check', amount, accepted_price)
    console.log('currencies check', currency, accepted_currency)
    if (amount == accepted_price && currency === accepted_currency) {
      utils.log('Reversal amount is correct!')
      reverseVote(reversal, 0)
      sendReversalComment(reversal)
    } else {
      console.log('Reversal amount NOT correct!')
    }
  } else {
    console.log('Reversal permlink wasnt found on processed_bids')
  }
}

function reverseVote(reversal, retries, callback) {
  utils.log('Reversal func activated');
  steem.broadcast.vote(config.posting_key, account.name, reversal.author, reversal.permlink, 0, function (err, result) {
    if (!err && result) {
      utils.log('Vote reversed for: @' + reversal.author + '/' + reversal.permlink);

      if (callback)
        callback();
    } else {
      logError('Error sending vote for: @' + reversal.author + '/' + reversal.permlink + ', Error: ' + err);

      // Try again on error
      if(retries < 2)
        setTimeout(function() { reverseVote(reversal, retries + 1, callback); }, 10000);
      else {
        utils.log('============= Vote reversal transaction failed three times for: @' + reversal.author + '/' + reversal.permlink + ' Reversal Amount: ' + reversal.price + ' ' + reversal.currency + ' ===============');
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
  checkReversalAmount: checkReversalAmount
}