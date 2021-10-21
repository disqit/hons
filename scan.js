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
        var spread = determineVerticalElementSpread(adYChart, true);
        determineVerticalElementSpread(pYChart, false);
        //classifyElementSpread(spread);
        determinePageType();

        result['h'] = $("body").height();
        result['w'] = $("body").width();

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
        var xGraph = {};

        for (var x=0;x<GRID_WIDTH;x++)
            xGraph[x] = 0;

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
                yGraph[y] += right-left;

            for (var x=left; x<right;x++)
                xGraph[x] += bottom-top;

            ctx.fillRect(left*20, top*20, (right-left)*20, (bottom-top)*20);
            let singleAdArea = getAdvertArea(adOffset);
            totalAdArea+=singleAdArea;
        }

        for (y in yGraph)
            if (yGraph[y]>GRID_WIDTH)
                yGraph[y] = GRID_WIDTH;

        //Before we calculate the area, trim excess width i.e margins on wide screens
        var numColsTrimmed = trimGridpoints(xGraph);
        console.log("Trimmed cols: "+numColsTrimmed);
        console.log(totalPageArea)
        totalPageArea = totalPageArea*(1-(numColsTrimmed/GRID_WIDTH));
        console.log(totalPageArea)

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
        console.log(yGraph);
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
            if (Math.abs(expectedQuartiles[i]-actualQuartiles[i])<6)
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

        if (isAd)
            result['distribution']= ("Sigma: "+sigma+", Vari: "+variability + ", Str: "+JSON.stringify(diffString));

        // Distribution number meanings are mapped in determinePageType()
        if (countOccurrences(diffString, 0)>8)
            typeOfDistribution = 0
        else if (variability<3 && Math.abs(sigma)>4)
        {
            if (countOccurrences(diffString.slice(0,4),-1)>2)
                typeOfDistribution = 2
            else
                typeOfDistribution = 4
        }
        // If high sigma + low variability then bottom heavy
        else if (sigma>6 && variability<2)
            typeOfDistribution = 5
        // If low negative sigma + low variability then top heavy
        else if (sigma<-6 && variability<2)
            typeOfDistribution = 1
        // If lower sigma + high variability then equal distribution
        else if (sigma<12 && variability>4)
            typeOfDistribution = 0
        // If lower sigma + low variability then middle heavy or t/b heavy
        else if (sigma<12 && variability<6)
        {
            if (countOccurrences(diffString.slice(0,9), 1)>2)
                typeOfDistribution = 3
            else
                typeOfDistribution = 6
        }
        else if (countOccurrences(diffString, 1)>17)
            typeOfDistribution = 5
        else if (countOccurrences(diffString, -1)>17)
            typeOfDistribution = 1;
        else
            typeOfDistribution = 0;

        if (isAd)
            result['adDiffFromExpected'] = typeOfDistribution;
        else
            result['pDiffFromExpected'] = typeOfDistribution;

        return {"sigma":sigma,"vari":variability};

    }

    function classifyElementSpread(spread)
    {
        const data = [
            {sigma:-19, var:0, distr:'Top'},
            {sigma:-13, var:2, distr:'Top'},
            {sigma:15, var:2, distr:'Bottom'},
            {sigma:0, var:0, distr:'Equal'},
            {sigma:-19, var:0, distr:'Top'},
            {sigma:0, var:0, distr:'Equal'},
            {sigma:-17, var:1, distr:'Top'},
            {sigma:0, var:0, distr:'Equal'},
            {sigma:-13, var:2, distr:'Top'},
            {sigma:0, var:0, distr:'Equal'},
            {sigma:8, var:8, distr:'Equal'},
            {sigma:15, var:1, distr:'Bottom'},
            {sigma:17, var:1, distr:'Bottom'},
            {sigma:9, var:1, distr:'Middle'},
            {sigma:-15, var:2, distr:'Top'},
            {sigma:-5, var:2, distr:'Middle'},
            {sigma:5, var:2, distr:'Middle'},
            {sigma:15, var:2, distr:'Bottom'},
            {sigma:-5, var:1, distr:'Middle'},
            {sigma:-11, var:2, distr:'Top'},
            {sigma:-8, var:7, distr:'Equal'},
            {sigma:-4, var:0, distr:'Middle'},
            {sigma:5, var:1, distr:'Middle'}
        ];

        const options = {task: 'classification',debug: false}

        const nn = ml5.neuralNetwork(options);

        data.forEach(item => {
            const inputs = {
                s: item.sigma, 
                v: item.var
            };
            const output = {
                d: item.distr
            };

            nn.addData(inputs, output);
        });

        nn.normalizeData();

        const trainingOptions = {epochs: 40,batchSize: 2}
        nn.train(trainingOptions, classify);

        function classify(){
            const input = {
                s: spread['sigma'],
                v: spread['vari']
            }
            nn.classify(input, handleResults);
        }

        function handleResults(error, resultClass) {
            if(error){
                console.error(error);
                return;
            }
            console.log(resultClass);
            result['spread'] = resultClass;
        }
    }

    function determinePageType()
    {
        // Integer divide the advert area by 5 and get the relevant value
        const adAreaRanks =
        {
            0: "no adverts to affect the page quality",
            1: "hardly any adverts to affect the page quality",
            2: "just a few adverts that don't affect the page quality much",
            3: "a handful of adverts that don't affect the page quality a lot",
            4: "numerous adverts that may detract from the reader experience",
            5: "noteable amounts of adverts that may impact the page quality",
            6: "adverts are very frequent and the page quality is lowered",
            7: "a lot of adverts and the page quality is lowered",
            8: "too many adverts to be comfortable with and the page quality is badly affected",
            9: "excessive adverts that take up most of the screen space and the page quality is likely very poor"
        } 

        const interruptRanks =
        {
            0: "There is only one or fewer paragraphs interrupted by adverts",
            1: "Paragraphs are interrupted by adverts two or three times",
            2: "Paragraphs are interrupted by adverts at least several times",
            3: "Paragraphs are badly interrupted with adverts"
        }

        const verticalDistribution = 
        {
            0: " seem to be equally distributed",
            1: " seem to be distributed most on the page top",
            2: " seem to be distributed most in the top and middle of the page",
            3: " seem to be distributed most in the middle of the page",
            4: " seem to be distributed most in the middle and bottom of the page",
            5: " seem to be distributed most in the bottom of the page",
            6: " seem to be distributed most in the top and bottom of the page",
        }

        // totalAdArea*100 / 6.6 (We make 6.6% count as level 1, 13.2% as 2 etc)
        var adLevel =  Math.min(~~(result['totalAdArea']*15),9);
        var adAreaConclusion = adAreaRanks[adLevel];
        var interruptLevel = Math.min(~~(result['numParagraphInterruptions']/2),3);
        var interruptConclusion = interruptRanks[interruptLevel];
        var adDistributionConclusion = verticalDistribution[result['adDiffFromExpected']];
        var additionalComment = ".";
        var letterScore = "A";
        console.log(result['pDiffFromExpected']);
        // Add a note if adverts are bottom heavy and paragraphs top heavy
        if ([1,2].includes(result['pDiffFromExpected']))
            if ([3,4,5].includes(result['adDiffFromExpected']))
            {
                //If here then we have a higher quality ad and p distribution
                additionalComment = ". However, the adverts come after the paragraph content so the page quality "+
                "may be percieved as alright, granted the reader does not scroll to the page bottom."
                letterScore = "B";
            }
        if (interruptLevel==3)
            letterScore = "C"

        var score = adLevel+letterScore;

        var adConclusion = "<br><br>There are <b>"+ result['numAdElements'] + "</b> advert elements detected, taking up <b>" +
                            (result['totalAdArea']*100).toFixed(0)+"%</b> of the content area.<br><br>"+ interruptConclusion
                            +".<br><br>Adverts "+ adDistributionConclusion+".<br><br>We can estimate that there are "+adAreaConclusion+additionalComment+
                            "<br><br><br><b style='font-size:1.3em;'>Score: "+score+"</b><br>"; 
        adConclusion += "<i>Score meaning: <br>Ad prominence goes from 0 (none) to 9 (60%+ area)."+
                        "<br>Advert/Paragraph distribution:"+
                        "<br>&nbsp;&nbsp;&nbsp;A: About equal distribution"+
                        "<br>&nbsp;&nbsp;&nbsp;B: Paragraphs come first, then most adverts"+
                        "<br>&nbsp;&nbsp;&nbsp;C: Paragraphs are highly disturbed by adverts</i>";

        result['conclusion'] = adConclusion;

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