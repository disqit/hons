'use strict';

function click(e)
{
    $("#loading").show();
    $("#loadImage").show();
    $("#goArea").hide();
    chrome.runtime.onMessage.addListener(function listener(result)
    {
        chrome.runtime.onMessage.removeListener(listener);
        $("#loading").hide();
        $("#loadImage").hide();
        showAnswer(result);
    });
    chrome.tabs.executeScript(null, {file: "scan.js"});
};

document.addEventListener('DOMContentLoaded', function ()
{
    $("#loading").hide();
    $("#loadImage").hide();
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
    $('#conclude').html(result["conclusion"]);
    /*$('#heatMapLink').html("Advert heatmap: ");
    $('#link').attr("href",result["heatmap"]);
    $('#link').attr("target","_blank");
    $('#link').html("View");*/
}

