//--------------------------------------
// モジュール
//--------------------------------------
const crypto = require("crypto");
const app  = require("express")();
const http = require("http").Server(app);
const io   = require("socket.io")(http);

//-----------------------------------------------
// 定数
//-----------------------------------------------
// HTTPサーバのポート
const PORT = 3000;

// HTMLやJSなどを配置するディレクトリ
const DOCUMENT_ROOT = __dirname + "/public";

// トークンを作成する際の秘密鍵
const SECRET_TOKEN = "abcdefghijklmn12345";

// Canvasサイズ
const MAX_WIDTH  = 600;     // 横幅
const MAX_HEIGHT = 400;     // 高さ

//-----------------------------------------------
// グローバル変数
//-----------------------------------------------
// 接続してきたユーザーの一覧
const MEMBER = {};
  // ↑以下のような内容のデータが入る
  // {
  //   "socket.id":{ 
  //            token:"abcd",
  //            count:1,
  //            name:"player1",
  //            score:{ 
  //              aces:     { using:false, point:0 }, 
  //              twos:     { using:false, point:0 },
  //              threes:   { using:false, point:0 },
  //              fours:    { using:false, point:0 },
  //              fives:    { using:false, point:0 },
  //              sixes:    { using:false, point:0 },
  //              threeKind:{ using:false, point:0 },
  //              fourKind: { using:false, point:0 },
  //              fullHouse:{ using:false, point:0 },
  //              sStraight:{ using:false, point:0 },
  //              lStraight:{ using:false, point:0 },
  //              chance:   { using:false, point:0 },
  //              yahtzee:  { using:false, point:0 }
  //          }
  //      }
  // }

// ゲームに参加しているユーザーの一覧
const MEMBER_SORT = [];

// 延べ参加者数
let MEMBER_COUNT = 1;

// 最大参加人数
const MAX_JOIN_COUNT = 2;

// 現在の参加人数
let CUR_JOIN_COUNT = 0;

// 現在のターンプレイヤーの公開トークン
let CUR_TURN_PLAYER_TOKEN = null;

// 振り直しできる残り回数
let REROLL_COUNT = 3;

// 直前のダイスロールの結果
let PRE_DICE_RESULTS = [ 0, 0, 0, 0, 0 ];

//-----------------------------------------------
// HTTPサーバ (express)
//-----------------------------------------------

// 「"/"」にアクセスがあったらindex.htmlを返却
app.get("/",            (req, res)=>{ res.sendFile(DOCUMENT_ROOT + "/index.html"); });

// その他のファイルへのアクセス（app.js, style.cssなど）
app.get("/:file",       (req, res)=>{ res.sendFile(DOCUMENT_ROOT + "/" + req.params.file); });

// 画像ファイルへのアクセス（/image/xxx.png）
app.get("/image/:file", (req, res)=>{ res.sendFile(DOCUMENT_ROOT + "/image/" + req.params.file); });

//--------------------------------------
// Socket.io
//--------------------------------------

// ユーザーが接続した時に呼ばれる
io.on("connection", (socket)=>{

  // 初回接続時
  (()=>{
    // トークンを作成
    const token = makeToken(socket.id);

    // ユーザーリストに追加
    MEMBER[socket.id] = { token:token, count:MEMBER_COUNT, name:null, score:null };
    MEMBER_COUNT++;

    // デバック用出力
    console.log(`newUser: socketid=${socket.id}`);

    // 本人にトークンを送付
    io.to(socket.id).emit("token", {token:token});
  })();


  // 入室イベント時の処理
  socket.on("join", (data)=>{

    // トークンをチェック
    if(!authToken(socket.id, data.token))
    {
      io.to(socket.id).emit("join-result", {status:false, message:"不正なトークンです"});
      return(false);
    }

    // 参加人数上限をチェック
    if (CUR_JOIN_COUNT >= MAX_JOIN_COUNT)
    {
      io.to(socket.id).emit("join-result", {status:false, message:"参加上限人数を超えています"});
      return(false);
    }

    // 現在の参加人数をインクリメント
    CUR_JOIN_COUNT++;

    // スコアを初期化
    const score =  { 
      aces:     { using:false, point:0 }, 
      twos:     { using:false, point:0 },
      threes:   { using:false, point:0 },
      fours:    { using:false, point:0 },
      fives:    { using:false, point:0 },
      sixes:    { using:false, point:0 },
      threeKind:{ using:false, point:0 },
      fourKind: { using:false, point:0 },
      fullHouse:{ using:false, point:0 },
      sStraight:{ using:false, point:0 },
      lStraight:{ using:false, point:0 },
      chance:   { using:false, point:0 },
      yahtzee:  { using:false, point:0 }
    };

    // ユーザー情報を追加
    MEMBER[socket.id].name = data.name;
    MEMBER[socket.id].score = score;
    MEMBER_SORT.push(socket.id);

    // デバック用出力
    console.log(`joinUser: socketid=${socket.id} name=${data.name} curJoinCount=${CUR_JOIN_COUNT}`);

    // 送信者以外のユーザー情報を送信者に通知（識別用のトークンは公開用）
    io.to(socket.id).emit("join-result", { status:true, users:getOtherMemberList(socket.id), canStart:(CUR_JOIN_COUNT === MAX_JOIN_COUNT) });

    // 送信者のユーザー情報を送信者に通知（識別用のトークンは非公開用）
    io.to(socket.id).emit("member-join", { token: MEMBER[socket.id].token, name:data.name, score: score });

    // 送信者のユーザー情報を送信者以外に通知（識別用のトークンは公開用）
    socket.broadcast.emit("member-join", { token: MEMBER[socket.id].count, name:data.name, score: score });

    // 開始可能状態だったら、送信者以外に開始可能通知を送る
    if (CUR_JOIN_COUNT === MAX_JOIN_COUNT)
    {
      // 最初に接続したプレイヤーをターンプレイヤーにする
      CUR_TURN_PLAYER_TOKEN = MEMBER[socket.id].count;

      // デバック用出力
      console.log(`startBattle: trunPlayerToken=${CUR_TURN_PLAYER_TOKEN}`);

      socket.broadcast.emit("canStartCheck", { canStart:true });
    }
  });

  // ダイスロールイベント時の処理
  socket.on("diceRoll", (data)=>{

    // トークンをチェック
    if(!authToken(socket.id, data.token))
    {
      io.to(socket.id).emit("diceRoll-result", {status:false, message:"不正なトークンです"});
      return(false);
    }

    // ターンプレイヤーかチェック
    if (MEMBER[socket.id].count != CUR_TURN_PLAYER_TOKEN)
    {
      io.to(socket.id).emit("diceRoll-result", {status:false, message:"ターンプレイヤーではありません"});
      return(false);
    }

    // もしも振り直し回数が０だったら
    if (REROLL_COUNT == 0)
    {
      io.to(socket.id).emit("diceRoll-result", {status:false, message:"もうサイコロは振れません"});
      return(false);
    }

    // 出目を更新する
    if (REROLL_COUNT == 3 || !data.lock[0]) PRE_DICE_RESULTS[0] = Math.floor(Math.random() * Math.floor(6)) + 1;
    if (REROLL_COUNT == 3 || !data.lock[1]) PRE_DICE_RESULTS[1] = Math.floor(Math.random() * Math.floor(6)) + 1;
    if (REROLL_COUNT == 3 || !data.lock[2]) PRE_DICE_RESULTS[2] = Math.floor(Math.random() * Math.floor(6)) + 1;
    if (REROLL_COUNT == 3 || !data.lock[3]) PRE_DICE_RESULTS[3] = Math.floor(Math.random() * Math.floor(6)) + 1;
    if (REROLL_COUNT == 3 || !data.lock[4]) PRE_DICE_RESULTS[4] = Math.floor(Math.random() * Math.floor(6)) + 1;

    // もしも振り直し回数が残っていたら
    if (REROLL_COUNT > 0)
    {
      // 振り直し回数を減らす
      REROLL_COUNT--;
    }

    console.log(`diceRoll: socketid=${socket.id} result=${PRE_DICE_RESULTS} rerollCount=${REROLL_COUNT}`);

    io.to(socket.id).emit("diceRoll-result", { status:true, diceResult:PRE_DICE_RESULTS });
  });

  // サイコロの役選択イベント時の処理
  socket.on("rollSelect", (data)=>{

    // トークンをチェック
    if(!authToken(socket.id, data.token))
    {
      io.to(socket.id).emit("rollSelect-result", {status:false, message:"不正なトークンです"});
      return(false);
    }
    
    // ターンプレイヤーかチェック
    if (MEMBER[socket.id].count != CUR_TURN_PLAYER_TOKEN)
    {
      io.to(socket.id).emit("rollSelect-result", {status:false, message:"ターンプレイヤーではありません"});
      return(false);
    }

    // もしも１度もサイコロを振っていなければ
    if (REROLL_COUNT == 3)
    {
      io.to(socket.id).emit("rollSelect-result", {status:false, message:"サイコロを振ってください"});
      return(false);
    }
    
    // 頭が回らないので脳死ごり押し
    let kindDiceCounts = [0, 0, 0, 0, 0, 0];
    let sum = 0;
    let noKindDiceType = 0;

    switch (data.selectedRoll)
    {
      case "1":
        
        if (MEMBER[socket.id].score.aces.using)
        {
          io.to(socket.id).emit("rollSelect-result", {status:false, message:"その役は使用済みです"});
          return(false);
        }

        MEMBER[socket.id].score.aces.using = true;

        for(let i = 0; i < PRE_DICE_RESULTS.length; i++)
        {
          if (PRE_DICE_RESULTS[i] == 1) MEMBER[socket.id].score.aces.point += 1;
        }
        break;

      case "2":
        
        if (MEMBER[socket.id].score.twos.using)
        {
          io.to(socket.id).emit("rollSelect-result", {status:false, message:"その役は使用済みです"});
          return(false);
        }

        MEMBER[socket.id].score.twos.using = true;

        for(let i = 0; i < PRE_DICE_RESULTS.length; i++)
        {
          if (PRE_DICE_RESULTS[i] == 2) MEMBER[socket.id].score.twos.point += 2;
        }
        break;

      case "3":
        
        if (MEMBER[socket.id].score.threes.using)
        {
          io.to(socket.id).emit("rollSelect-result", {status:false, message:"その役は使用済みです"});
          return(false);
        }

        MEMBER[socket.id].score.threes.using = true;

        for(let i = 0; i < PRE_DICE_RESULTS.length; i++)
        {
          if (PRE_DICE_RESULTS[i] == 3) MEMBER[socket.id].score.threes.point += 3;
        }
        break;

      case "4":
        
        if (MEMBER[socket.id].score.fours.using)
        {
          io.to(socket.id).emit("rollSelect-result", {status:false, message:"その役は使用済みです"});
          return(false);
        }

        MEMBER[socket.id].score.fours.using = true;

        for(let i = 0; i < PRE_DICE_RESULTS.length; i++)
        {
          if (PRE_DICE_RESULTS[i] == 4) MEMBER[socket.id].score.fours.point += 4;
        }
        break;

      case "5":
        
        if (MEMBER[socket.id].score.fives.using)
        {
          io.to(socket.id).emit("rollSelect-result", {status:false, message:"その役は使用済みです"});
          return(false);
        }

        MEMBER[socket.id].score.fives.using = true;

        for(let i = 0; i < PRE_DICE_RESULTS.length; i++)
        {
          if (PRE_DICE_RESULTS[i] == 5) MEMBER[socket.id].score.fives.point += 5;
        }
        break;

      case "6":
        
        if (MEMBER[socket.id].score.sixes.using)
        {
          io.to(socket.id).emit("rollSelect-result", {status:false, message:"その役は使用済みです"});
          return(false);
        }

        MEMBER[socket.id].score.sixes.using = true;

        for(let i = 0; i < PRE_DICE_RESULTS.length; i++)
        {
          if (PRE_DICE_RESULTS[i] == 6) MEMBER[socket.id].score.sixes.point += 6;
        }
        break;

      case "7":
        
        if (MEMBER[socket.id].score.threeKind.using)
        {
          io.to(socket.id).emit("rollSelect-result", {status:false, message:"その役は使用済みです"});
          return(false);
        }

        MEMBER[socket.id].score.threeKind.using = true;

        for(let i = 0; i < PRE_DICE_RESULTS.length; i++)
        {
          sum += PRE_DICE_RESULTS[i];

          kindDiceCounts[PRE_DICE_RESULTS[i] - 1]++;
        }

        if (kindDiceCounts[0] >= 3 || kindDiceCounts[1] >= 3 || kindDiceCounts[2] >= 3 || kindDiceCounts[3] >= 3 || kindDiceCounts[4] >= 3 || kindDiceCounts[5] >= 3)
        {
          MEMBER[socket.id].score.threeKind.point = sum;
        }
        break;

      case "8":
        
        if (MEMBER[socket.id].score.fourKind.using)
        {
          io.to(socket.id).emit("rollSelect-result", {status:false, message:"その役は使用済みです"});
          return(false);
        }

        MEMBER[socket.id].score.fourKind.using = true;

        for(let i = 0; i < PRE_DICE_RESULTS.length; i++)
        {
          sum += PRE_DICE_RESULTS[i];

          kindDiceCounts[PRE_DICE_RESULTS[i] - 1]++;
        }

        if (kindDiceCounts[0] >= 4 || kindDiceCounts[1] >= 4 || kindDiceCounts[2] >= 4 || kindDiceCounts[3] >= 4 || kindDiceCounts[4] >= 4 || kindDiceCounts[5] >= 4)
        {
          MEMBER[socket.id].score.fourKind.point = sum;
        }
        break;

      case "9":
        
        if (MEMBER[socket.id].score.fullHouse.using)
        {
          io.to(socket.id).emit("rollSelect-result", {status:false, message:"その役は使用済みです"});
          return(false);
        }

        MEMBER[socket.id].score.fullHouse.using = true;

        for(let i = 0; i < PRE_DICE_RESULTS.length; i++)
        {
          kindDiceCounts[PRE_DICE_RESULTS[i] - 1]++;
        }

        for(let i = 0; i < kindDiceCounts.length; i++)
        {
          if (kindDiceCounts[i] == 0) noKindDiceType++;
        }

        console.log(kindDiceCounts);

        if (noKindDiceType == 3)
        {
          console.log("full");
          MEMBER[socket.id].score.fullHouse.point = 25;
        }
        break;

      case "10":
        
        if (MEMBER[socket.id].score.sStraight.using)
        {
          io.to(socket.id).emit("rollSelect-result", {status:false, message:"その役は使用済みです"});
          return(false);
        }

        MEMBER[socket.id].score.sStraight.using = true;

        for(let i = 0; i < PRE_DICE_RESULTS.length; i++)
        {
          kindDiceCounts[PRE_DICE_RESULTS[i] - 1]++;

          if (kindDiceCounts[PRE_DICE_RESULTS[i] - 1] > 1) break;
        }

        if (kindDiceCounts[2] == 0 || kindDiceCounts[3] == 0) break;

        if (kindDiceCounts[0] == 1 && kindDiceCounts[1] == 0) break;

        if (kindDiceCounts[4] == 0 && kindDiceCounts[5] == 1) break;

        // 以下の文が蛇足かどうか後で調べる（９割９分蛇足）
        for(let i = 0; i < kindDiceCounts.length; i++)
        {
          if (kindDiceCounts[i] == 0) noKindDiceType++;
        }

        if (noKindDiceType == 1)
        {
          MEMBER[socket.id].score.sStraight.point = 30;
        }

        break;

      case "11":
        
        if (MEMBER[socket.id].score.lStraight.using)
        {
          io.to(socket.id).emit("rollSelect-result", {status:false, message:"その役は使用済みです"});
          return(false);
        }

        MEMBER[socket.id].score.lStraight.using = true;

        for(let i = 0; i < PRE_DICE_RESULTS.length; i++)
        {
          kindDiceCounts[PRE_DICE_RESULTS[i] - 1]++;

          if (kindDiceCounts[PRE_DICE_RESULTS[i] - 1] > 1) break;
        }

        MEMBER[socket.id].score.lStraight.point = 40;
        break;

      case "12":
        
        if (MEMBER[socket.id].score.chance.using)
        {
          io.to(socket.id).emit("rollSelect-result", {status:false, message:"その役は使用済みです"});
          return(false);
        }

        MEMBER[socket.id].score.chance.using = true;

        for(let i = 0; i < PRE_DICE_RESULTS.length; i++)
        {
          MEMBER[socket.id].score.chance.point += PRE_DICE_RESULTS[i];
        }
        break;

      case "13":
        
        if (MEMBER[socket.id].score.yahtzee.using)
        {
          io.to(socket.id).emit("rollSelect-result", {status:false, message:"その役は使用済みです"});
          return(false);
        }

        MEMBER[socket.id].score.yahtzee.using = true;

        let preDiceResult = PRE_DICE_RESULTS[0];

        for(let i = 1; i < PRE_DICE_RESULTS.length; i++)
        {
          if (preDiceResult != PRE_DICE_RESULTS[i]) break;
        }

        MEMBER[socket.id].score.yahtzee.point = 50;
        break;
    }

    // ターンプレイヤーを更新する
    let nextMember = false;
    for (let i = 0; i < MEMBER_SORT.length; i++)
    {
      if (nextMember)
      {
        CUR_TURN_PLAYER_TOKEN = MEMBER[MEMBER_SORT[i]].count;
        nextMember = false;
        break;
      }

      if (CUR_TURN_PLAYER_TOKEN == MEMBER[MEMBER_SORT[i]].count) nextMember = true;
    }
    if (nextMember)
    {
      CUR_TURN_PLAYER_TOKEN = MEMBER[MEMBER_SORT[0]].count;
    }

    REROLL_COUNT = 3;
    PRE_DICE_RESULTS = [ 0, 0, 0, 0, 0 ];

    io.to(socket.id).emit("rollSelect-result", {status:true, score:MEMBER[socket.id].score });
    
    socket.broadcast.emit("update-score", { token: MEMBER[socket.id].count, score:MEMBER[socket.id].score });
  });

  // 強制的にSocket.ioサーバから切断された時に呼ばれる
  socket.on("disconnect", ()=>{

    console.log(`exitUser: socketid=${socket.id}`);

    // 他のユーザーに切断された通知を飛ばす
    socket.broadcast.emit("member-quit", { token:MEMBER[socket.id].count });

    // MEMBER_SORT配列から削除
    const index = MEMBER_SORT.indexOf(socket.id);
    if (index > -1)
    {
      MEMBER_SORT.splice(index, 1);
    }

    // MEMBERから削除
    if( socket.id in MEMBER )
    {
      delete MEMBER[socket.id];
    }
  });
});

// 3000番でサーバを起動する
http.listen(PORT, ()=>{
  console.log(`listening on *:${PORT}`);
});

/**
 * トークンを作成する
 *
 * @param   {string} id  -socket.id
 * @return  {string}
 */
function makeToken(id)
{
  const str = SECRET_TOKEN + id;

  return( crypto.createHash("sha1").update(str).digest('hex') );
}

/**
 * 本人からの通信か確認する
 *
 * @param   {string} socketid
 * @param   {string} token
 * @return  {boolean}
 */
function authToken(socketid, token)
{
  return((socketid in MEMBER) && (token === MEMBER[socketid].token));
}

/**
 * メンバー一覧を作成する
 *
 * @param   {string} socketid
 * @return  {array}
 */
function getOtherMemberList(socketid)
{
  const list = [];

  for(let i=0; i<MEMBER_SORT.length; i++)
  {
    const id = MEMBER_SORT[i];
    const cur = MEMBER[id];

    if( id !== socketid )
    {
      list.push({token:cur.count, name:cur.name, score:cur.score });
    }
  }
  return(list);
}