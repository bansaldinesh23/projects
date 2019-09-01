(function(){
    "use strict";
    var catArray = ['cat_1', 'cat_2', 'cat_3', 'cat_4', 
                    'cat_5', 'cat_6', 'cat_7', 'cat_8',
                    'cat_9', 'cat_10', 'cat_11', 'cat_12'
                    ];
    
    var initialGridIndex = 0;
    var initialClickCount = 0;
    var isDuplicate = false;
    var gridArray = [[],[],[],[]];

    var catClickFunc = catClickFunc;

    // first function to activate

    activate();

    function activate(){
       // adding a timeout to give a ajax call apperance
        setTimeout(function(){
            createCats();
        }, 500);
    }

    function createCats(){
        var html = '';
        var gridCatsHtml = '<div class="cats-grid-heading">Cats Grid</div>';
        for(var i=0; i<catArray.length; i++){
            html += '<div class="cats" id="'+catArray[i]+'"><img src="assets/'+catArray[i]+'.png" /></div>';
            gridCatsHtml+='<div class="grid-cats"></div>';
        }

        document.getElementById('cats-wrapper').innerHTML = html;
        document.getElementById('cat-grid-wrapper').innerHTML = gridCatsHtml;
        
        // binding event listners
        bindClickFunction('bind');
        document.getElementById('page-loader').style.display = 'none';
    }
    
    function bindClickFunction(type){
        var catDivArray = document.getElementsByClassName('cats');
        for(var i=0; i<catDivArray.length; i++){
            if(type === 'bind'){
                catDivArray[i].addEventListener('click', catClickFunc, false);
            }else if(type === 'unbind'){
                catDivArray[i].removeEventListener('click', catClickFunc, false);
            }
        }
    } 
    
    function catClickFunc(){
        // to check if prev item exist in row
        if(gridArray[initialGridIndex].length > 0 && gridArray[initialGridIndex][gridArray[initialGridIndex].length - 1] === this.id){
            isDuplicate = true;
        };
        document.getElementsByClassName('grid-cats')[initialClickCount].innerHTML = '<img src="assets/'+this.id+'.png" />';
        gridArray[initialGridIndex].push(this.id);

        if(gridArray[initialGridIndex].length === 3){
            if(initialGridIndex === 3){
                bindClickFunction('unbind');
                //adding a delay to render image first then showing alert in same function 
                setTimeout(function(){
                    finalState();
                }, 100)
            };
            initialGridIndex = initialGridIndex + 1;
        };
        
        console.log(gridArray);
        initialClickCount = initialClickCount +1;
    }

    function finalState(){
        if(isDuplicate){
            alert('YOU LOSE');
        }else{
            alert('YOU WIN');
        }
    }

})();