var socket;
var users = 0;
var canvas;
var coins = [];
var birds = [];
var betsAmount = 0;
var mark = false;
var Hash = "";
$(function(){
    var loaderContainer = jQuery('<div/>', {
        id:     'loaderContainer',
        style:  "position: absolute;"+
                "top: 0; right: 0; bottom: 0; left: 0;"+
                "z-index: 1000;"
    }).appendTo('body');
    
    var loaderSegment = jQuery('<div/>', {
        class:  'ui segment',
        style:  'height: 100%; opacity: 0.7;'
    }).appendTo(loaderContainer);
    
    var loaderDimmer = jQuery('<div/>', {
        class:  'ui active dimmer'
    }).appendTo(loaderSegment);
    
    var loadeText = jQuery('<div/>', {
        id:     'loaderText',
        class:  'ui text loader',
        text:   'Connecting'
    }).appendTo(loaderDimmer);
    
    // https://blog.moneypot.com/introducing-socketpot/
    socket = io('https://socket.moneypot.com');
    var config = {
        app_id: 852,
        access_token: ((getURLParameter('access_token')!="" && getURLParameter('access_token')!=null)?getURLParameter('access_token'):undefined),
        subscriptions: ['CHAT', 'DEPOSITS', 'BETS']
    };
    
    socket.on('connect', function() {
        console.info('[socketpot] connected');
        var authRequest = {
            app_id: config.app_id,
            access_token: config.access_token,
            subscriptions: config.subscriptions
        };
        socket.emit('auth', authRequest, function(err, authResponse) {
            if (err) {
                $('#loaderContainer').css('display', 'block');
                $('#loaderText').text('Error while connecting: '+ err);
                console.error('[auth] Error:', err);
                return;
            }
            var authData = authResponse;
            $('#loaderContainer').css('display', 'none');
            if(getURLParameter('access_token')!="" && getURLParameter('access_token')!=null){
                $("#connectButton").css('display', 'none');
                jQuery('<input/>', {
                    id:     'chatText',
                    type:   'text',
                    maxlength: '200',
                    placeholder: 'Chat here'
                }).appendTo('#chat');
                
                jQuery('<button/>', {
                    id:     'chatButton',
                    text:   'Send'
                }).appendTo('#chat');
                
                $( "#chatText" ).keyup(function(event){
                    onkeyup_check(event)
                });
                
                $( "#chatButton" ).click(function(){
                    sendMessage(String(document.getElementById('chatText').value));
                });
                
                $("#connectedUsersAmount").text(ObjectLength(authData.chat.userlist));
                
                console.log(authData);
                for(var i=0; i<authData.chat.messages.length; i++){
                    addNewChatMessage(authData.chat.messages[i]);
                }
                
                $.getJSON("https://api.moneypot.com/v1/token?access_token="+getURLParameter('access_token'), function(json){
                    $('#connectionText').css('display', 'block');
                    $('#betPanel').css('display', 'block');
                    $('#username').text(json.auth.user.uname);
                    $('#balance').text((json.auth.user.balance/100).formatMoney(2,'.',','));
                    $.post("https://api.moneypot.com/v1/hashes?access_token="+getURLParameter('access_token'), '', function(json) {
                        console.log("[Provably fair] We received our first hash: "+json.hash);
                        Hash = json.hash;
                    }, 'json');
                });
            }
        });
    });
    
    socket.on('disconnect', function() {
        console.warn('[socketpot] disconnected');
        document.getElementById("chatMonitor").innerHTML = "";
    });
    socket.on('client_error', function(err) {
        console.error('[socketpot] client_error:', err);
    });
    socket.on('error', function(err) {
        console.error('[socketpot] error:', err);
    });
    socket.on('reconnect_error', function(err) {
        console.error('[socketpot] error while reconnecting:', err);
        $('#loaderContainer').css('display', 'block');
        $('#loaderText').text('Error while reconnecting: '+ err);
    });
    socket.on('reconnecting', function() {
        console.warn('[socketpot] attempting to reconnect...');
        $('#loaderContainer').css('display', 'block');
        $('#loaderText').text('Reconnecting');
    });
    socket.on('reconnect', function() {
        console.info('[socketpot] successfully reconnected');
        $('#loaderContainer').css('display', 'none');
    });
    
    // chat related
    socket.on('user_joined', function() {
        users++;
        $("connectedUsersAmount").text(users);
    });
    socket.on('user_left', function() {
        users--;
        $("connectedUsersAmount").text(users);
    });
    socket.on('new_message', function(payload) {
        addNewChatMessage(payload);
    });
    
    // bet related
    socket.on('new_bet', function(payload) {
        console.log('[new_bet]', payload);
        
        createCoin(payload);
    });
    
    // balance updated
    socket.on('balance_change', function(payload) {
        $('#balance').text((payload.balance/100).formatMoney(2,'.',','));
    });
    

    // ***********
    // PRELOADS
    // ***********
    
    var images = [];
    function preload() {
        for (var i = 0; i < preload.arguments.length; i++) {
            images[i] = new Image();
            images[i].src = preload.arguments[i];
        }
    }
    preload(
        "lib/css/img/game_bg.png", // 0
        "lib/css/img/generator.png", // 1
        "lib/css/img/platform.png", // 2
        "lib/css/img/coin.png", // 3
        "lib/css/img/logo.png", // 4
        "lib/css/img/bird.png" // 5
    );
    
    // ***********
    // FRAME REQUESTS
    // ***********
    window.requestAnimFrame = (function(){
      return  window.requestAnimationFrame       || 
              window.webkitRequestAnimationFrame || 
              window.mozRequestAnimationFrame    || 
              window.oRequestAnimationFrame      || 
              window.msRequestAnimationFrame     || 
              function(/* function */ callback, /* DOMElement */ element){
                window.setTimeout(callback, 1000 / 60); // (16.666Â¯ ms)
              };
    })();
    
    // ***********
    // CANVAS
    // ***********
    jQuery('<canvas/>', {
        id:     'gamePlatform',
        style:  "position: absolute;"+
                "left: calc(50% - "+window.innerWidth/2+"px); top: 0;"+
                "width: 100%; height: 700px;"
    }).appendTo('body');
    
    canvas = document.getElementById("gamePlatform");
    canvas.width = window.innerWidth;
    canvas.height = 700;
    
    // ***********
    // VARIABLES
    // ***********
    var ctx = canvas.getContext("2d"),
        platforms = [];
        
    var game = {
        width: canvas.width,
        height: canvas.height,
        gravity: 0.3
    };
    
    var user = {
        connected: false,
        uname: null
    }
    
    function createBird(){
        if(getRandomInt(0, 5) == 0){
            var data = {
                x: -52,
                y: (canvas.height/2) + 25,
                velX: 3,
                velY: 0
            };
            birds.push(data);
        }
    }
    
    function moveBirds() {
        for(var i=0; i<birds.length; i++){
            var bird = birds[i];
            
            bird.velY += game.gravity;
            
            bird.x += bird.velX;
            bird.y += bird.velY;
            
            if(bird.y >= 450){
                bird.velY -= 3;
            }
            
            if(bird.x > canvas.width){
                birds.splice(birds.indexOf(bird), 1);
            }
        }
    }
    
    function render(){
        ctx.clearRect(0, 0, game.width, game.height);
        
        for (var i = birds.length - 1; i >= 0; i--) {
            ctx.drawImage(images[5], birds[i].x, birds[i].y);
        }
        
        ctx.drawImage(images[0], game.width/2 - 320, game.height/2 - 280);
        ctx.drawImage(images[1], game.width/2 - 13, 0);
        
        for (var i = platforms.length - 1; i >= 0; i--) {
            ctx.drawImage(images[2], platforms[i].x, platforms[i].y);
        }
        
        ctx.drawImage(images[4], 10, 10);
        
        
        for (var i = coins.length - 1; i >= 0; i--) {
            if(coins[i].uname != $('#username').text()){
                ctx.save();
                ctx.globalAlpha = 0.7;
            }
            
            ctx.drawImage(images[3], coins[i].x, coins[i].y);
            
            if(coins[i].uname != $('#username').text()){
                ctx.restore();
            }
        }
        
    }
    
    function start(){
        //socket.emit("ping", {time: (new Date()).getTime()});
        generatePlatforms();
        setInterval(function(){
            createBird();
        }, 2000);
    }
    
    function update(){
        moveCoins();
        moveBirds();
        render();
        window.requestAnimFrame(update);
    }
    
    function moveCoins(){
        for(var i=0; i<coins.length; i++){
            
            var coin = coins[i];
            
            var curTime = "";
            curTime = new Date().getTime();
            
            if(coin.y < 100){
                easeMove(coin, coin.x, 101, 0.1);
            }
            
            if( coin.y == 100 || (coin.y > 100 && coin.y < 125) && coin.date + 1000 <= curTime){
                coin.step = 0;
                if(coin.path.split('')[coin.step] == "L"){
                    easeMove(coin, coin.x - 16, coin.y + 26, 0.05);
                }
                if(coin.path.split('')[coin.step] == "R"){
                    easeMove(coin, coin.x + 16, coin.y + 26, 0.05);
                }
            }
            
            if( coin.y == 126 || (coin.y > 126 && coin.y < 151) && coin.date + 2000 <= curTime){
                coin.step = 1;
                if(coin.path.split('')[coin.step] == "L"){
                    easeMove(coin, coin.x - 16, coin.y + 26, 0.05);
                }
                if(coin.path.split('')[coin.step] == "R"){
                    easeMove(coin, coin.x + 16, coin.y + 26, 0.05);
                }
            }
            
            if( coin.y == 152 || (coin.y > 152 && coin.y < 178) && coin.date + 3000 <= curTime){
                coin.step = 2;
                if(coin.path.split('')[coin.step] == "L"){
                    easeMove(coin, coin.x - 16, coin.y + 26, 0.05);
                }
                if(coin.path.split('')[coin.step] == "R"){
                    easeMove(coin, coin.x + 16, coin.y + 26, 0.05);
                }
            }
            
            if( coin.y == 178 || (coin.y > 178 && coin.y < 204) && coin.date + 4000 <= curTime){
                coin.step = 3;
                if(coin.path.split('')[coin.step] == "L"){
                    easeMove(coin, coin.x - 16, coin.y + 26, 0.05);
                }
                if(coin.path.split('')[coin.step] == "R"){
                    easeMove(coin, coin.x + 16, coin.y + 26, 0.05);
                }
            }
            
            if( coin.y == 204 || (coin.y > 204 && coin.y < 230) && coin.date + 5000 <= curTime){
                coin.step = 4;
                if(coin.path.split('')[coin.step] == "L"){
                    easeMove(coin, coin.x - 16, coin.y + 26, 0.05);
                }
                if(coin.path.split('')[coin.step] == "R"){
                    easeMove(coin, coin.x + 16, coin.y + 26, 0.05);
                }
            }
            
            if( coin.y == 230 || (coin.y > 230 && coin.y < 256) && coin.date + 6000 <= curTime){
                coin.step = 5;
                if(coin.path.split('')[coin.step] == "L"){
                    easeMove(coin, coin.x - 16, coin.y + 26, 0.05);
                }
                if(coin.path.split('')[coin.step] == "R"){
                    easeMove(coin, coin.x + 16, coin.y + 26, 0.05);
                }
            }
            
            if( coin.y == 256 || (coin.y > 256 && coin.y < 282) && coin.date + 7000 <= curTime){
                coin.step = 6;
                if(coin.path.split('')[coin.step] == "L"){
                    easeMove(coin, coin.x - 16, coin.y + 26, 0.05);
                }
                if(coin.path.split('')[coin.step] == "R"){
                    easeMove(coin, coin.x + 16, coin.y + 26, 0.05);
                }
            }
            
            if( coin.y == 282 || (coin.y > 282 && coin.y < 308) && coin.date + 8000 <= curTime){
                coin.step = 7;
                if(coin.path.split('')[coin.step] == "L"){
                    easeMove(coin, coin.x - 16, coin.y + 26, 0.05);
                }
                if(coin.path.split('')[coin.step] == "R"){
                    easeMove(coin, coin.x + 16, coin.y + 26, 0.05);
                }
            }
            
            if( coin.y == 308 || (coin.y > 308 && coin.y < 334) && coin.date + 9000 <= curTime){
                coin.step = 8;
                if(coin.path.split('')[coin.step] == "L"){
                    easeMove(coin, coin.x - 16, coin.y + 26, 0.05);
                }
                if(coin.path.split('')[coin.step] == "R"){
                    easeMove(coin, coin.x + 16, coin.y + 26, 0.05);
                }
            }
            
            if( coin.y == 334 || (coin.y > 334 && coin.y < 360) && coin.date + 10000 <= curTime){
                coin.step = 9;
                if(coin.path.split('')[coin.step] == "L"){
                    easeMove(coin, coin.x - 16, coin.y + 26, 0.05);
                }
                if(coin.path.split('')[coin.step] == "R"){
                    easeMove(coin, coin.x + 16, coin.y + 26, 0.05);
                }
            }
            
            if( coin.y == 360 || (coin.y > 360 && coin.y < 386) && coin.date + 11000 <= curTime){
                coin.step = 10;
                if(coin.path.split('')[coin.step] == "L"){
                    easeMove(coin, coin.x - 16, coin.y + 26, 0.05);
                }
                if(coin.path.split('')[coin.step] == "R"){
                    easeMove(coin, coin.x + 16, coin.y + 26, 0.05);
                }
            }
            
            if( coin.y == 386 || (coin.y > 386 && coin.y < 412) && coin.date + 12000 <= curTime){
                coin.step = 11;
                if(coin.path.split('')[coin.step] == "L"){
                    easeMove(coin, coin.x - 16, coin.y + 26, 0.05);
                }
                if(coin.path.split('')[coin.step] == "R"){
                    easeMove(coin, coin.x + 16, coin.y + 26, 0.05);
                }
            }
            
            if( coin.y == 412 || (coin.y > 412 && coin.y < 438) && coin.date + 13000 <= curTime){
                coin.step = 12;
                if(coin.path.split('')[coin.step] == "L"){
                    easeMove(coin, coin.x - 16, coin.y + 26, 0.05);
                }
                if(coin.path.split('')[coin.step] == "R"){
                    easeMove(coin, coin.x + 16, coin.y + 26, 0.05);
                }
            }
            
            if( coin.y == 438 || (coin.y > 438 && coin.y < 464) && coin.date + 14000 <= curTime){
                coin.step = 13;
                if(coin.path.split('')[coin.step] == "L"){
                    easeMove(coin, coin.x - 16, coin.y + 26, 0.05);
                }
                if(coin.path.split('')[coin.step] == "R"){
                    easeMove(coin, coin.x + 16, coin.y + 26, 0.05);
                }
            }
            
            if( coin.y >= 464 ){
                $('#coin_'+coin.id+' td:nth-child(5)').text(coin.profit+' Bits');
                $('#coin_'+coin.id+' td:nth-child(4)').text(coin.multiplier);
                $.getJSON("https://api.moneypot.com/v1/token?access_token="+getURLParameter('access_token'), function(json){
                    $('#balance').text((json.auth.user.balance/100).formatMoney(2,'.',','));
                });
                coins.splice(coins.indexOf(coin), 1);
            }
        }
    }
    
    window.addEventListener("load", function(){
        start();
        update();
    });
    
    function randomFloat(min,max){
        return Math.random()*(max-min+1)+min;
    }
    
    $(window).resize(function() {
        /*
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        game.width = canvas.width;
        game.height = canvas.height;
        */
    });
    
    function easeMove(obj, x, y, easing){
        var easingAmount = easing;
        var xDistance = x - obj.x;
        var yDistance = y - obj.y;
        var distance = Math.sqrt(xDistance * xDistance + yDistance * yDistance);
        if (distance >= 1) {
            obj.x += xDistance * easingAmount;
            obj.y += yDistance * easingAmount;
        }
    }

    function generatePlatforms() {
        var limit = 16;
        var step = 1;
        
        for(var i=3; i<=limit; i++){
            for(var j=0; j<=i-1; j++){
                platforms.push({
                    x: (canvas.width/2 - 4) - (16*i) + (32*j) + 12,
                    y: 40 + (26*i),
                    width: 8,
                    height: 8
                });
            }
            step++;
        }
    }
});

function createCoin(payload){
    betsAmount++;
    var data = payload;
    var id = data.bet_id,
        profit = parseFloat(data.profit/100).formatMoney(2, '.', ','),
        username = data.uname,
        bet = parseFloat(data.wager/100).formatMoney(0, '.', ','),
        outcome = String(data.outcome),
        payouts = data.payouts;
    var win = parseFloat(data.profit/100) >= 0;
    
    var real_outcome = 0;
    for(var i=0; i<payouts.length; i++){
        if(outcome < payouts[i].to && outcome >= payouts[i].from){
            real_outcome = i;
            break;
        }
    }
    
    var path = "";
    var x = 7;
    for(var i=0; i<14; i++){
        if(i<13){
            if(x==real_outcome){
                var rand = getRandomInt(0, 1);
                x += (rand==0?-0.5:0.5);
                path += (rand==0?"L":"R");
            }else if(x>real_outcome){
                x-=0.5;
                path += "L";
            }else if(x<real_outcome){
                x+=0.5;
                path += "R";
            }
        }else{
            if(x>real_outcome){
                x-=0.5;
                path += "L";
            }else if(x<real_outcome){
                x+=0.5;
                path += "R";
            }
        }
    }
    console.log(path);
    
    var multiplier = 0;
    if(real_outcome == 0) multiplier = 6;
    if(real_outcome == 1) multiplier = 5;
    if(real_outcome == 2) multiplier = 4;
    if(real_outcome == 3) multiplier = 3;
    if(real_outcome == 4) multiplier = 2;
    if(real_outcome == 5) multiplier = 1;
    if(real_outcome == 6) multiplier = 0.8;
    if(real_outcome == 7) multiplier = 0.1;
    if(real_outcome == 8) multiplier = 0.8;
    if(real_outcome == 9) multiplier = 1;
    if(real_outcome == 10) multiplier = 2;
    if(real_outcome == 11) multiplier = 3;
    if(real_outcome == 12) multiplier = 4;
    if(real_outcome == 13) multiplier = 5;
    if(real_outcome == 14) multiplier = 6;
    
    var table = document.getElementById("tableContent");
    
    var row = table.insertRow(0);
    row.id = "coin_"+id;
    
    var cell1 = row.insertCell(0);
    var cell2 = row.insertCell(1);
    var cell3 = row.insertCell(2);
    var cell4 = row.insertCell(3);
    var cell5 = row.insertCell(4);
    
    cell1.innerHTML = "<a href=\"https://www.moneypot.com/bets/"+id+"\" target=\"blank\">"+id+"</a>";
    cell2.innerHTML = username;
    cell3.innerHTML = bet+" Bits";
    cell4.innerHTML = "Pending..."; //multiplier+"x";
    cell5.innerHTML = "Pending..."; //(win?"+":"")+profit;
    cell5.className = (win?"win":"lose");
    
    if(mark){
        row.className = "marked";
        mark = false;
    }else{
        row.className = "notMarked";
        mark = true;
    }
    
    if(betsAmount>100){
        var rowCount = table.rows.length;
        table.deleteRow(rowCount -1);
        betsAmount = 100;
    }
    
    var curTime = new Date().getTime();
    var newCoin = {
        id: id,
        x: (canvas.width/2) - 11,
        y: 45,
        width: 22,
        height: 22,
        path: path, // 14
        step: 0,
        date: curTime,
        uname: username,
        profit: String((win?"+":"")+profit),
        multiplier: multiplier+"x"
    }
    coins.push(newCoin);
}

function getURLParameter(name) {
  return decodeURIComponent((new RegExp('[#|&]' + name + '=' + '([^&;]+?)(&|#|;|$)').exec(location.hash)||[,""])[1].replace(/\+/g, '%20'))||null
}

function onkeyup_check(e){
    if (e.keyCode == 13){
        sendMessage(document.getElementById("chatText").value);
    }
}

function sendMessage(data){
    document.getElementById("chatText").value = "";
    var text = data;
    socket.emit('new_message', {
        text: data
    }, function(err, msg){
        if (err) {
            console.log('Error when submitting new_message to server:', err);
            return;
        }
        console.log('Successfully submitted message:', msg);
        
    });
}

function ObjectLength( object ) {
    var length = 0;
    for( var key in object ) {
        if( object.hasOwnProperty(key) ) {
            ++length;
        }
    }
    return length;
};

function addNewChatMessage(data){
    if(typeof data.user !== "undefined"){
        var username = data.user.uname;
        var rank = data.user.role;
    }else{
        var username = "Server";
        var rank = "server";
    }
    var date = {
        hours: addZero((new Date(data.created_at)).getHours()),
        mins: addZero((new Date(data.created_at)).getMinutes())
    }
    var message = data.text;
    
    var chatMonitor = document.getElementById("chatMonitor");
    var servStyle = (username=="Server"?"style='color:green;font-weight:bold;'":"");
    var modStyle = ((rank=="MOD" || rank=="OWNER")?"style='text-shadow:0 0 3px rgba(255,0,0,0.3);'":"");
    chatMonitor.innerHTML += "<span class=\"chatMessage\" "+servStyle+"><small>"+date.hours+":"+date.mins+"</small> <b "+modStyle+">"+username+"</b>: "+message+"<br></span>";
    chatMonitor.scrollTop = chatMonitor.scrollHeight;
    
    var allChatMessages = document.getElementsByClassName("chatMessage");
    if(allChatMessages.length > 120){
        chatMonitor.removeChild(allChatMessages[0]);
    }
}

function addZero(i) {
    if (i < 10) {
        i = "0" + i;
    }
    return i;
}


function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

Number.prototype.formatMoney = function(c, d, t){
    var n = this, 
        c = isNaN(c = Math.abs(c)) ? 2 : c, 
        d = d == undefined ? "." : d, 
        t = t == undefined ? "," : t, 
        s = n < 0 ? "-" : "", 
        i = parseInt(n = Math.abs(+n || 0).toFixed(c)) + "", 
        j = (j = i.length) > 3 ? j % 3 : 0;
    return s + (j ? i.substr(0, j) + t : "") + i.substr(j).replace(/(\d{3})(?=\d)/g, "$1" + t) + (c ? d + Math.abs(n - i).toFixed(c).slice(2) : "");
};

$('#depositButton').click(function() {
    var windowUrl = 'https://www.moneypot.com/dialog/deposit?app_id=852';
    var windowName = 'manage-auth';
    var windowOpts = 'width=420,height=350,left=100,top=100';
    var windowRef = window.open(windowUrl, windowName, windowOpts);
    windowRef.focus();
});

$('#withdrawButton').click(function() {
    var windowUrl = 'https://www.moneypot.com/dialog/withdraw?app_id=852';
    var windowName = 'manage-auth';
    var windowOpts = 'width=420,height=350,left=100,top=100';
    var windowRef = window.open(windowUrl, windowName, windowOpts);
    windowRef.focus();
});

$('#doBetButton').click(function() {
    var bet = Math.round($('#betAmount').val()*100);
    
    $.ajax({
        type: "POST",
        contentType: "application/json",
        url: "https://api.moneypot.com/v1/bets/plinko?access_token="+getURLParameter('access_token'),
        data: JSON.stringify({
            client_seed: 12345,
            hash: String(Hash),
            wager: bet,
            pay_table: [6, 5, 4, 3, 2, 1, 0.8, 0.1, 0.8, 1, 2, 3, 4, 5, 6]
        }),
        dataType: "json"
    }).done(function(data){
        if(data.next_hash){
            console.log("[Provably fair] new hash: "+data.next_hash);
            Hash = data.next_hash;
            //createCoin(data);
        }else{
            console.log("BET ERROR: "+JSON.stringify(data.responseJSON));
        }
    });
    
});

