//https://easylist.to/easylist/easylist.txt


(function(){
    const GRID_WIDTH = 48;

    window.stop();

    if (!window.jQuery)
    {
        console.log("jQuery is not present!")
        return;
    }
    else
        console.log("jQuery is present in page");

    var result = {};
    scan().then(result => chrome.runtime.sendMessage(result));

    function delay() 
    {
        return new Promise( resolve => setTimeout(resolve, 2000));
    }

    async function scan()
    {
        await scrollDown();
        var regexList = blacklist.join();
        var adElements = $(regexList);
        adElements = filterUnwantedElements(adElements);
        var adYChart = getChartFromAdLocations(adElements, true);
        var pElements = $('p');
        var pYChart = getChartFromAdLocations(pElements, false);
        drawGraph(pYChart, adYChart);
        result['numAdElements'] = adElements.length;
        estimateParagraphInterruptions(pYChart, adYChart);
        determineVerticalElementSpread(adYChart, true);
        determineVerticalElementSpread(pYChart, false);

        // If the area difference is 0 -> no side ads overlapping

        //console.log(adElements);

        for (let i=0;i<adElements.length;i++)
            $(adElements[i]).css("border", "5px dashed #002bff");

        for (let i=0;i<pElements.length;i++)
            $(pElements[i]).css("border", "2px dashed orange");

        return new Promise(resolve => resolve(result));
    }

    async function scrollDown()
    {
        var pageHeight = $("body").height();
        var scrollStateActive = true;
        while (scrollStateActive)
        {
            window.scroll({
                left: 0,
                top: pageHeight,
                behavior: "smooth"
            });

            await delay();

            if ($("body").height()===pageHeight)
            {
                //Finite
                scrollStateActive = false;
                window.scroll({
                    left: 0,
                    top: 0,
                    behavior: "smooth"
                });
            }
            else if ($("body").height()>20000)
            {
                //Treat as infinite
                scrollStateActive = false;
                window.scroll({
                    left: 0,
                    top: 0,
                    behavior: "smooth"
                });
            }
            else
                pageHeight = $("body").height();
        };
        return new Promise(resolve => resolve('Complete'));
    }

    /*
    Remove any elements that have a width or height < 50px
    These elements are typically empty spacing, logos or mismatches
    Also remove hidden elements
    */
    function filterUnwantedElements(tempAdElements)
    {
        var adElements = [];
        for (var i =0; i<tempAdElements.length;i++)
        {
            if (($(tempAdElements[i]).height()>50)&&($(tempAdElements[i]).width()>50))
                if (($(tempAdElements[i]).css('display') !== 'hidden') && ($(tempAdElements[i]).css('display') !== 'none'))
                    adElements.push(tempAdElements[i]);
        }
        return filterOverlappingElements(adElements);
    }

    /*
    Overlaying ad elements will occur as there can be several nested elements 
    that have an advert characteristic. We do not want to count all of these 
    elements, so check for overlaps and keep the child element
    */
    function filterOverlappingElements(adElements)
    {
        var clashingAds = {};
        for (var i=0; i<adElements.length;i++)
            for (var j=0; j<adElements.length;j++)
            {
                if (j!==i)
                    if (adIsInSameLocation(getOffset($(adElements[i])), getOffset($(adElements[j]))))
                    {
                        // These elements are holding the same advert. Add to clash list
                        let locationId = getLocationId(getOffset($(adElements[i])));
                        var tempItems = [];
                        if (locationId in clashingAds)
                            tempItems = clashingAds[locationId];
                        if (!(tempItems.includes($(adElements[i]))))
                            tempItems.push($(adElements[i]));
                        clashingAds[locationId] = tempItems;
                    }
            }

        var adsToRemove = [];

        for (var clashList in clashingAds)
            adsToRemove = adsToRemove.concat(clashingAds[clashList].slice(1))

        var filteredElements = [];
        for (var i=0; i<adElements.length;i++)
        {
            var toRemove = false;
            for (var j=0; j<adsToRemove.length; j++)
                if ($(adElements[i]).is($(adsToRemove[j])))
                {
                    toRemove = true;
                    j = adsToRemove.length;
                }
            if (!(toRemove))
                filteredElements.push(adElements[i]);
        }

        return filteredElements;
    }

    function adIsInSameLocation(aOffset, bOffset)
    {        
        if ((Math.abs(aOffset.left-bOffset.left)<20) && (Math.abs(aOffset.right-bOffset.right)<20) && (Math.abs(aOffset.top-bOffset.top)<20) && (Math.abs(aOffset.bottom-bOffset.bottom)<20))
            return true;
        return ((Math.abs(aOffset.top-bOffset.top)<20)&&(Math.abs(aOffset.bottom-bOffset.bottom)<20))
    }

    function getLocationId(offset)
    {
        var id = Math.floor(offset.left/20);
        id += "" + Math.floor(offset.bottom/20);
        id += "" + Math.floor(offset.right/20);
        id += "" + Math.floor(offset.top/20);
        return id;
    }

    function getChartFromAdLocations(adElements, isAd)
    {
        var pageWidth = $("body").width();
        var pageHeight = $("body").height();

        var xPartitionWidth = pageWidth/GRID_WIDTH;
        var numYPartitions = GRID_WIDTH*(pageHeight/pageWidth);
        var yParitionHeight = pageHeight/numYPartitions;

        /*
        A separate object is used for the x and y graphs for simpler
        compatibility with the graph library
        */
        var yGraph = {};

        for (var y=0;y<numYPartitions;y++)
            yGraph[y] = 0;

        var totalPageArea = pageHeight*pageWidth;
        var pageHeatmap = document.createElement('canvas');
        pageHeatmap.width = GRID_WIDTH*20;
        pageHeatmap.height = numYPartitions*20;
        pageHeatmap.style.position = "absolute";
        pageHeatmap.style.zIndex = -1;
        pageHeatmap.style.backgroundColor = '#3c32a8';
        var ctx = pageHeatmap.getContext('2d');
        ctx.fillStyle = '#a86032';

        var totalAdArea = 0;
        for (let i=0;i<adElements.length;i++)
        {
            let adOffset = getOffset($(adElements[i]));
            let left = Math.floor(adOffset['left']/xPartitionWidth);
            let right = Math.floor(adOffset['right']/xPartitionWidth);
            let top = Math.floor(adOffset['top']/yParitionHeight);
            let bottom = Math.floor(adOffset['bottom']/yParitionHeight);
            for (var y=top; y<=bottom; y++)
            { 
                yGraph[y] += right-left;
            }

            ctx.fillRect(left*20, top*20, (right-left)*20, (bottom-top)*20);
            let singleAdArea = getAdvertArea(adOffset);
            totalAdArea+=singleAdArea;
        }

        //Before we calculate the area, trim excess width i.e margins on wide screens
        var numColsTrimmed = trimGridpoints(yGraph);
        console.log("Trimmed cols: "+numColsTrimmed);
        totalPageArea = totalPageArea*(1-(numColsTrimmed/GRID_WIDTH));

        if (!isAd)
        {
            /*
            Sometimes there are hidden paragraphs in the very top of the page. 
            As a general rule, we discard any paragraph elements in the first block 
            as these are irrelevant in either case.
            */
            yGraph[0] = 0;
            result["totalParagraphArea"] = totalAdArea/totalPageArea;
        }
        else{
            result["totalAdArea"] = totalAdArea/totalPageArea;
        }

        
        console.log("% area: "+totalAdArea/totalPageArea);
        var heatmap = pageHeatmap.toDataURL();

        totalAdArea = 0;
        
        //document.body.appendChild(xChartElement);
        console.log(yGraph);
        return yGraph;
    }

    function drawGraph(pG, adG)
    {
        var chartElement = document.createElement('canvas');
        chartElement.width = '150';
        chartElement.height = '800';
        chartElement.style.position = 'absolute';
        var context = chartElement.getContext('2d');
        const chartConfig = 
        {
            type: 'line',
            options: {indexAxis: "y", bezierCurve: true},
            data: {
                labels: Object.keys(adG),
                datasets: [
                    {
                        label: "Adverts",
                        data: Object.values(adG),
                        fill: false,
                        borderColor: '#0046FF',
                        tension: 0,
                        yAxisID: 'y1'
                    },
                    {
                        label: "Paragraphs",
                        data: Object.values(pG),
                        fill: false,
                        borderColor: '#FF8700',
                        tension: 0,
                        yAxisID: 'y2'
                    }
                ]
            },
        }
    
        var yChart = new Chart(context, chartConfig);
        document.body.appendChild(chartElement);
    }

    /*
    Remove any 'whitespace' columns on the left and right sides
    */
    function trimGridpoints(yGraph)
    {
        var colsToTrim = [];
        for (var row in yGraph)
        {
            if (yGraph[row]==0)
                colsToTrim.push(row);
        }
        var trimToColFromLeft = 0;
        var trimToColFromRight = GRID_WIDTH-1;    

        if (colsToTrim.length>4)
        {
            // Trim from left
            for (var l=0;l<colsToTrim.length;l++)
                if (colsToTrim[l]!=l)
                {
                    // Stop trimming here
                    trimToColFromLeft = l-1;
                    l = colsToTrim.length;
                }
            // Trim from right
            for (var r=colsToTrim.length-1;r>=0;r--)
                if (colsToTrim[r]!=trimToColFromRight)
                {
                    // Stop trimming here
                    r = 0;
                    trimToColFromRight+=1;
                }
                else
                    trimToColFromRight-=1;
        }
        
        return trimToColFromLeft+(GRID_WIDTH-trimToColFromRight);
        for (var x=0;x<=trimToColFromLeft;x++)
            delete yGraph[x];
        for (var x=GRID_WIDTH;x>=trimToColFromRight;x--)
            delete yGraph[x];
        console.log(yGraph);
        return yGraph;
    }

    function estimateParagraphInterruptions(pYChart, adYChart)
    {
        var gaps = [];
        var inGap = false;

        var startEndPair = {'start': 0, 'end':0}; 

        for (var y in pYChart)
        {
            if ((pYChart[y]==0)&&(!inGap))
            {
                startEndPair['start'] = parseInt(y);
                inGap = true;
            }
            else if ((Math.abs(pYChart[y])>0)&&(inGap))
            {
                startEndPair['end'] = parseInt(y);
                inGap = false;
                if (startEndPair['start']!=0)
                    gaps.push(JSON.parse(JSON.stringify(startEndPair)));
            }
        }

        var numAdGaps = 0;
        for (var g=0;g<gaps.length;g++)
        {
            var gap = gaps[g];
            var numAdRows = 0;
            var startEndDiff = gap['end']-gap['start'];
            if ((startEndDiff<21)&&(startEndDiff>3))
            {
                for (var i=gap['start'];i<gap['end'];i++)
                {
                    if (adYChart[i]!=0)
                        numAdRows += 1;
                }
                // https://www.desmos.com/calculator/inudavxmqu
                // Threshold for advert size between paragraphs to count
                var threshold = Math.round(Math.sqrt(1.25*startEndDiff));
                // If threshold is less than numAdRows, we can count this ad
                if (numAdRows>=threshold)
                {
                    numAdGaps+=1;
                    console.log(gap);
                }
            }

        }
        console.log("Gaps total: "+numAdGaps);
        result["numParagraphInterruptions"] = numAdGaps;
        return numAdGaps;
    }

    function determineVerticalElementSpread(yChart, isAd)
    {
        const countOccurrences = (arr, val) => arr.reduce((a, v) => (v === val ? a + 1 : a), 0);
        console.log(yChart);
        var len = 0;
        var min = 1;
        var max = 0;
        for (y in yChart)
        {
            if (!isNaN(yChart[y]))
            {
                max += yChart[y]
                yChart[y] = max;
                // Quick fix for any remaining overlapping ads
                len++;
            }
        }
        // What would the dectiles be if the adverts/graph were equally spread?
        console.log("Max: "+max);
        var expectedQuartiles = [];
        for (var i=0;i<20;i++)
        {
            expectedQuartiles.push(Math.round(max*0.05*i)); 
        }
        var actualQuartiles = [];
        for (var i=0;i<20;i++)
        {
            actualQuartiles.push(yChart[Math.round(len*0.05*i)]);
        }
        console.log("Expected: ")
        console.log(expectedQuartiles);
        console.log("Actual: ")
        console.log(actualQuartiles);
        console.log("Diff: ")
        var diffString = new Array(19);
        for (var i=1;i<20;i++)
        {
            //If below is true, the actual frequency is below the expected
            if (Math.abs(expectedQuartiles[i]-actualQuartiles[i])<4)
                diffString[i-1] = 0;
            else if ((expectedQuartiles[i]-actualQuartiles[i])>0)
                diffString[i-1] = 1;
            else 
                diffString[i-1] = -1;
        }
        console.log(diffString);
        
        var typeOfDistribution;
        var sigma = 0;
        var variability = 0;
        var lastItem = diffString[0];
        for (var x of diffString)
        {
            sigma += x;
            if (x!=lastItem)
                variability+=1;
            lastItem = x;
        }

        console.log("Sigma: "+sigma+", Vari: "+variability);

        if (variability==1 && Math.abs(sigma)>4)
        {
            if (countOccurrences(diffString.slice(0,4),-1)>2)
                typeOfDistribution = "Top and middle heavy";
            else
                typeOfDistribution = "Bottom and middle heavy";
        }
        // If high sigma + low variability then bottom heavy
        else if (sigma>6 && variability<5)
            typeOfDistribution = "Bottom heavy";
        // If low negative sigma + low variability then top heavy
        else if (sigma<-6 && variability<5)
            typeOfDistribution = "Top heavy";
        // If lower sigma + high variability then equal distribution
        else if (sigma<12 && variability>4)
            typeOfDistribution = "Equal"
        // If lower sigma + low variability then middle heavy or t/b heavy
        else if (sigma<12 && variability<6)
        {
            if (countOccurrences(diffString.slice(0,9), 1)>2)
                typeOfDistribution = "Middle heavy";
            else
                typeOfDistribution = "Head & Footer heavy";
        }
        else
            typeOfDistribution = "U: Sigma "+sigma+ ", Vari "+variability;

        if (isAd)
            result['adDiffFromExpected'] = typeOfDistribution;
        else
            result['pDiffFromExpected'] = typeOfDistribution;


    }

    function getAdvertArea(offset)
    {
        return (offset.right-offset.left)*(offset.bottom-offset.top);
    }

    function getOffset(el)
    {
        var offset = $(el).offset();
        offset["bottom"] = offset["top"] + $(el).height();
        offset["right"] = offset["left"] + $(el).width();
        return offset;
     }


})();