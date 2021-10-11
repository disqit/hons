'use strict';

function click(e)
{
    chrome.runtime.onMessage.addListener(function listener(result)
    {
        chrome.runtime.onMessage.removeListener(listener);
        showAnswer(result);
    });
    chrome.tabs.executeScript(null, {file: "crawl.js"});
};

document.addEventListener('DOMContentLoaded', function ()
{
    chrome.tabs.executeScript(null, {file: "./jQuery/jquery.js"}, function()
    {
        chrome.tabs.executeScript(null, {file: "./injectedCode.js"}, function()
        {
            $("#go").on('click', click);
        });
    });    
});

function showAnswer(result)
{
    console.log(result);
    $('#numAds').text("Number of adverts: "+result['numAdElements']);
    $('#adArea').text("Advert area: "+(result['totalAdArea']*100).toFixed(2)+"%");
    $('#pArea').text("Paragraph area: "+(result['totalParagraphArea']*100).toFixed(2)+"%");
    $('#gaps').text("Advert interruptions: "+result['numParagraphInterruptions']);
    $('#adDiff').text("Advert diff from mean: "+JSON.stringify((result['adDiffFromExpected'])));
    $('#pDiff').text("Paragr diff from mean: "+JSON.stringify((result['pDiffFromExpected'])));
}

