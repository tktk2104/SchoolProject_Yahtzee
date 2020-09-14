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
// 参加者一覧
const MEMBER = {};
  // ↑以下のような内容のデータが入る
  // {
  //   "socket.id":{ 
  //            token:"abcd",
  //            count:1,
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

// 参加者を順番に取り出す用の配列
const MEMBER_SORT = [];

// 延べ参加者数
let MEMBER_COUNT = 1;

// 最大参加人数
const MAX_JOIN_COUNT = 2;

// 現在の参加人数
let CUR_JOIN_COUNT = 0;

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
    MEMBER[socket.id] = { token:token, count:MEMBER_COUNT, score:null };
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
    MEMBER[socket.id].score = score;
    MEMBER_SORT.push(socket.id);

    // デバック用出力
    console.log(`joinUser: socketid=${socket.id} curJoinCount=${CUR_JOIN_COUNT}`);

    // 入室イベント結果を送信者のみに通知
    io.to(socket.id).emit("join-result", { status:true, users:getMemberList(socket.id), canStart:(CUR_JOIN_COUNT === MAX_JOIN_COUNT) });

    // 開始可能状態だったら、送信者以外に開始可能通知を送る
    if (CUR_JOIN_COUNT === MAX_JOIN_COUNT)
    {
      // デバック用出力
      console.log(`startBattle`);

      socket.broadcast.emit("canStartCheck", { canStart:true });
    }

    // 全てのユーザーに追加されたユーザー情報を通知する
    io.to(socket.id).emit("member-join", {
      token: MEMBER[socket.id].token,   // 秘密トークン
      score: score                      // 初期スコア
    });
    socket.broadcast.emit("member-join", {
      token: MEMBER[socket.id].count,   // 公開トークン
      score: score                      // 初期スコア
    });
  });

  // 強制的にSocket.ioサーバから切断された時に呼ばれる
  socket.on("disconnect", ()=>{

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
function getMemberList(socketid)
{
  const list = [];

  for(let i=0; i<MEMBER_SORT.length; i++)
  {
    const id = MEMBER_SORT[i];
    const cur = MEMBER[id];

    if( id !== socketid )
    {
      list.push({token:cur.count, score:cur.score});
    }
  }
  return(list);
}