//自分自身の情報を入れる箱
const IAM = {
  token:    null,     // トークン
  name:     null,     // 名前
  is_join:  false     // 入室中？
};

// メンバー一覧を入れる箱
const MEMBER = {};
  //  ↑以下のような内容のデータが入る
  //  {
  //    1:{
  //      name:"player1",
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
  "/image/3.png",
  "/image/4.png",
  "/image/5.png",
  "/image/6.png"
];

// 画像をロードする（ロードが終わったらconnectServer()を呼ぶ）
const charaImage =  new CharaImage(imagelist, ()=>{ connectServer(); });

// 直前のダイスロールの結果
let diceResults = [0, 0, 0, 0, 0];

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

  // 入力内容を取得する
  const userName = $("#userName");
  if(userName.value === "")
  {
    return(false);
  }

  IAM.name = userName.value;

  // Socket.ioサーバへ送信
  socket.emit("join", { token:IAM.token, name:IAM.name});

  // ボタンを無効にする
  $("#startBtn button").setAttribute("disabled", "disabled");
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
    for(let i = 0; i < data.users.length; i++)
    {
      const cur         = data.users[i];
      MEMBER[cur.token] = { name:cur.name, score:cur.score };

      // 重複して要素を持たない為の処理
      if (!MEMBER_SORT.includes(cur.token)) //if(!(cur.token in MEMBER_SORT)) <-何故か上手く動作しない
      {
        MEMBER_SORT.push(cur.token);
      }
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

// ダイスロールボタンが押されたら
$("#diceRollBtn").addEventListener("click", (e)=>
{
  // 規定の送信処理をキャンセル(画面遷移しないなど)
  e.preventDefault();

  // Socket.ioサーバへ送信
  socket.emit("diceRoll", { token:IAM.token, lock:[
    document.getElementById("checkbox1").checked,
    document.getElementById("checkbox2").checked,
    document.getElementById("checkbox3").checked,
    document.getElementById("checkbox4").checked,
    document.getElementById("checkbox5").checked
  ]});
});

// ダイスロール結果のイベントを取得したら
socket.on("diceRoll-result", (data)=>
{
  if(data.status)
  {
    diceResults = data.diceResult;
  }
  else
  {
    alert("サイコロを振る権利がありません");
    console.log(data);
  }
});

// 役選択ボタンが押されたら
$("#frm-roll").addEventListener("submit", (e)=>
{
  // 規定の送信処理をキャンセル(画面遷移しないなど)
  e.preventDefault();

  // 入力内容を取得する
  let selectedRoll = $("#frm-roll input[name='radio-rollSelect']:checked").value;

  // Socket.ioサーバへ送信
  socket.emit("rollSelect", {token:IAM.token, selectedRoll:selectedRoll});
});

// 役選択結果のイベントを取得したら
socket.on("rollSelect-result", (data)=>
{
  if(data.status)
  {
    MEMBER[IAM.token].score = data.score;

    console.log(data.score);
  }
  else
  {
    alert("選べない役です");
    console.log(data);
  }
});

// スコア更新のイベントを取得したら
socket.on("update-score", (data)=>
{
  MEMBER[data.token].score = data.score;
});

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

  let positions = [
    [300, 100],
    [380, 100],
    [460, 100],
    [340, 180],
    [420, 180],
  ];

  // サイコロを描画
  for (let i = 0; i < diceResults.length; i++)
  {
    if (diceResults[i] != 0)
    {
      ctx.drawImage(charaImage.getImage(diceResults[i] - 1), positions[i][0], positions[i][1]);
    }
  }

  // キャラクターを描画
  for (let i = 0; i < MEMBER_SORT.length; i++)
  {
    const token = MEMBER_SORT[i];
    const score = MEMBER[token].score;
    drawScoreBoard(MEMBER[token].name, score, 10 + 150 * i, 10);
  }
}

function drawScoreBoard(name, score, x, y)
{
  // スコアボードの外枠の描画
  ctx.beginPath() ;
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 4;
  ctx.rect(x,       y,      120,  45);
  ctx.rect(x,       y + 45,  80, 305);
  ctx.rect(x + 80,  y + 45,  40, 305);

  ctx.moveTo(x,       y + 205);
  ctx.lineTo(x + 120, y + 205);
  ctx.stroke();

  ctx.lineWidth = 1;
  for(let i = 0; i < 7; i++)
  {
    ctx.moveTo(x,       y + 65 + 20 * i);
    ctx.lineTo(x + 120, y + 65 + 20 * i);
  }
  for(let i = 0; i < 6; i++)
  {
    ctx.moveTo(x,       y + 225 + 20 * i);
    ctx.lineTo(x + 120, y + 225 + 20 * i);
  }
  ctx.stroke();
  
  // どのプレイヤーのスコアボードかの描画
  ctx.font = "24px serif";
  ctx.fillText(name, x + 20, y + 30);
  
  // サイコロの役の名前の描画
  ctx.font = "12px serif";
  ctx.fillText("aces",        x + 10, y + 60);
  ctx.fillText("twos",        x + 10, y + 80);
  ctx.fillText("threes",      x + 10, y + 100);
  ctx.fillText("fours",       x + 10, y + 120);
  ctx.fillText("fives",       x + 10, y + 140);
  ctx.fillText("sixes",       x + 10, y + 160);
  ctx.fillText("sum",         x + 50, y + 180);
  ctx.fillText("63bonus",     x + 10, y + 200);

  ctx.fillText("threeKind",   x + 10, y + 220);
  ctx.fillText("fourKind",    x + 10, y + 240);
  ctx.fillText("fullHouse",   x + 10, y + 260);
  ctx.fillText("sStraight",   x + 10, y + 280);
  ctx.fillText("lStraight",   x + 10, y + 300);
  ctx.fillText("chance",      x + 10, y + 320);
  ctx.fillText("yahtzee",     x + 10, y + 340);

  // サイコロの役の得点の描画
  if (score.aces.using)   ctx.fillText(score.aces.point,            x + 90, y + 60);
  if (score.aces.using)   ctx.fillText(score.aces.point,            x + 90, y + 60);
  if (score.threes.using) ctx.fillText(score.threes.point,          x + 90, y + 100);
  if (score.fours.using)  ctx.fillText(score.fours.point,           x + 90, y + 120);
  if (score.fives.using)  ctx.fillText(score.fives.point,           x + 90, y + 140);
  if (score.sixes.using)  ctx.fillText(score.sixes.point,           x + 90, y + 160);

  let sumScore = score.aces.point + score.twos.point + score.threes.point + score.fours.point + score.fives.point + score.sixes.point;
  ctx.fillText(sumScore, x + 90, y + 180);

  if (sumScore >= 63)     ctx.fillText(35,                          x + 90, y + 200);

  if (score.threeKind.using)  ctx.fillText(score.threeKind.point,   x + 90, y + 220);
  if (score.fourKind.using)   ctx.fillText(score.fourKind.point,    x + 90, y + 240);
  if (score.fullHouse.using)  ctx.fillText(score.fullHouse.point,   x + 90, y + 260);
  if (score.sStraight.using)  ctx.fillText(score.sStraight.point,   x + 90, y + 280);
  if (score.lStraight.using)  ctx.fillText(score.lStraight.point,   x + 90, y + 300);
  if (score.chance.using)     ctx.fillText(score.chance.point,      x + 90, y + 320);
  if (score.yahtzee.using)    ctx.fillText(score.yahtzee.point,     x + 90, y + 340);
}


// 誰かが入室したイベントを取得した時
socket.on("member-join", (data)=>
{
  MEMBER[data.token] = { name:data.name, score:data.score };

  // 重複して要素を持たない為の処理
  if (!MEMBER_SORT.includes(data.token)) //if(!(cur.token in MEMBER_SORT)) <-何故か上手く動作しない
  {
    MEMBER_SORT.push(data.token);
  }
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
  if(data.token in MEMBER)
  {
    delete MEMBER[data.token];
  }
});