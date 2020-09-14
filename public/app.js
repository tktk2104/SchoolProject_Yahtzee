//自分自身の情報を入れる箱
const IAM = {
  token: null,    // トークン
  chara: null,    // キャラ
  is_join: false  // 入室中？
};

// メンバー一覧を入れる箱
const MEMBER = {};
  //  ↑以下のような内容のデータが入る
  //  {
  //    1:{
  //      score:{ 
  //        aces:     { using:false, point:0 }, 
  //        twos:     { using:false, point:0 },
  //        threes:   { using:false, point:0 },
  //        fours:    { using:false, point:0 },
  //        fives:    { using:false, point:0 },
  //        sixes:    { using:false, point:0 },
  //        threeKind:{ using:false, point:0 },
  //        fourKind: { using:false, point:0 },
  //        fullHouse:{ using:false, point:0 },
  //        sStraight:{ using:false, point:0 },
  //        lStraight:{ using:false, point:0 },
  //        chance:   { using:false, point:0 },
  //        yahtzee:  { using:false, point:0 }
  //      }
  // }
  // ※連想配列のキーはサーバから送られてくるtoken

// メンバー一覧のソート用
const MEMBER_SORT = [];

// Socket.ioのクライアント
const socket = io({ autoConnect: false });// 即時接続"しない"

// Canvas関係
const canvas = document.querySelector("#battlefield");
const ctx = canvas.getContext("2d");

// 読み込むリソースのパス
const imagelist = [
  "/image/1.png",
  "/image/2.png",
  "/image/3.png"
];

// 画像をロードする（ロードが終わったらconnectServer()を呼ぶ）
const charaImage =  new CharaImage(imagelist, ()=>{ connectServer(); });

// Socket.ioサーバへ接続する
function connectServer()
{
  // 自身がサーバーに接続していなかったら
  if(!IAM.is_join)
  {
    // 読み込みシーンから接続シーンに遷移する
    $("#loadingScene").style.display    = "none";
    $("#conectingScene").style.display  = "block";
  }

  // Socket.ioサーバへ接続する
  socket.open();
}

// トークンが発行されたイベントを取得したら
socket.on("token", (data)=>
{
  // トークンを保存
  IAM.token = data.token;

   // 自身がサーバーに接続していなかったら
  if(!IAM.is_join)
  {
    // 接続シーンからタイトルシーンに遷移する
    $("#conectingScene").style.display  = "none";
    $("#titleScene").style.display      = "block";
  }
});

// ゲーム開始ボタンが押されたら
$("#startBtn").addEventListener("click", (e)=>
{
  // 規定の送信処理をキャンセル(画面遷移しないなど)
  e.preventDefault();

  // Socket.ioサーバへ送信
  socket.emit("join", { token:IAM.token });
});

// 入室結果のイベントを取得したら
socket.on("join-result", (data)=>
{
  // 入室の可否を判定
  if( data.status )
  {
    // 入室フラグを立てる
    IAM.is_join = true;

    // すでに入室中のユーザーをMEMBERへ入れる
    for(let i=0; i < data.users.length; i++)
    {
      const cur         = data.users[i];
      MEMBER[cur.token] = { score:cur.score };
      MEMBER_SORT.push(cur.token);
    }

    // タイトルシーンからプレイヤー待機シーンに遷移する
    $("#titleScene").style.display            = "none";
    $("#waitOtherPlayerScene").style.display  = "block";

    // 直ぐにゲームを始められるか？
    if (data.canStart)
    {
      // ゲーム開始
      startBattle();
    }
  }
  else
  {
    alert("入室できませんでした");
    console.log(data);
  }
});

// ゲーム開始イベントを取得したら
socket.on("canStartCheck", (data)=>
{
  if (data.canStart)
    {
      // ゲーム開始
      startBattle();
    }
});

// ゲーム開始
function startBattle()
{
   // プレイヤー待機シーンからバトルシーンに遷移する
  $("#waitOtherPlayerScene").style.display  = "none";
  $("#battleScene").style.display           = "block";

  canvas.setAttribute("tabindex", 0);
  canvas.focus();

  // ゲームループ開始
  update();
}

// ゲームループ
function update()
{
  draw();
  window.requestAnimationFrame(update);
}

// 描画処理
function draw()
{
  // Canvasの全領域をクリア
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  //// キャラクターを描画
  //for ( let i=0; i<MEMBER_SORT.length; i++) {
  //  const token = MEMBER_SORT[i];
  //  const chara = MEMBER[token].chara - 1;
  //  const pos   = MEMBER[token].pos;
  //  ctx.drawImage(charaImage.getImage(chara), pos.x, pos.y);
  //}
}


// 誰かが入室したイベントを取得した時
socket.on("member-join", (data)=>
{
  MEMBER[data.token] = { score:data.score };
  MEMBER_SORT.push(data.token);
});

// 誰かが退室したイベントを取得した時
socket.on("member-quit", (data)=>
{
  // MEMBER_SORT配列から削除
  const index = MEMBER_SORT.indexOf(data.token);

  if (index > -1)
  {
    MEMBER_SORT.splice(index, 1);
  }

  // MEMBER配列から削除
  if( data.token in MEMBER )
  {
    delete MEMBER[data.token];
  }
});