# cclaunch — design

Claude Code (cc) + launch.

タスクをキューに積むと、cmux のワークスペースを割り当てて Claude Code を自動起動する。

## 責務

**起動までを担当し、それ以降は cmux に任せる。**

起動後のセッションを cclaunch は追跡しない。ユーザー入力が必要になれば cmux が通知を出すし、
やり取りの履歴は `~/.claude/projects` に残る（clauspect で読める）。
cclaunch がそれらを再実装する理由はない。

### 非目標

- 完了検知。cmux の通知で足りる。
- 同時起動数の制限。積んだ順に起こして、人間が順番に回収すればいい。
- 実行履歴。cmux のワークスペースと `~/.claude/projects` に既にある。
- 起動時の承認ゲート。積んだら勝手に起きてほしい。

## 制約: cmux の socket 権限

`cmux` コマンドは socket ファイルへのアクセス権を要求し、これは **cmux から起動されたプロセスにのみ**
付与される（設定でフル開放もできるが、それに依存しない）。

したがって cmux を叩けるのは、cmux 内で起動された常駐プロセスだけになる。ここから不変条件が一つ出る:

> **cmux を叩くのは runner だけ。CLI は cmux に触らない。**

CLI (`add`) はキューファイルに 1 行 append するだけで、socket も cmux も要らない。
副産物として、runner が落ちていても `add` は成功し、次に runner が上がった時に回収される。

## 構成

```
cmux
 └ workspace: cclaunch            ← 最初に人間が1回だけ作る
     └ cclaunch run  (foreground) ← socket 権限を持つ唯一のプロセス
         └ spawn: cmux new-workspace --name cclaunch-<id> --cwd <cwd> --command "claude '<prompt>'"

どの端末からでも: cclaunch add -C ~/src/foo "型エラーを直す"
```

## キュー

`~/.cclaunch/queue.jsonl`。pending のみを持つ。1 行 1 タスク、先頭が次に起動されるもの。

```jsonl
{"id":"01K9X…","cwd":"/Users/nao/src/foo","prompt":"型エラーを直す"}
{"id":"01K9Y…","cwd":"/Users/nao/src/bar","prompt":"README を書き直す"}
```

JSONL を選んだのは、**人間が手で並べ替えるから**。「これ先にやりたい」「これもう要らない」は必ず起きる。
行指向のテキストなら `$EDITOR` で行を入れ替えるだけで済み、`ls` / `rm` / `mv` 相当のサブコマンドを
一つも書かなくていい。SQLite が提供するもの（トランザクション、並行制御、インデックス）は
数十行のデータに対して全部不要で、代わりに手編集の容易さを失う。

done は持たない。持つと pop 時に「消すか、フラグを立てるか」の判断が発生してファイルが汚れる。
pending だけなら pop は「先頭行を消して起動する」以外の意味を持たない。

## コマンド

| | |
|---|---|
| `cclaunch run [--port <n>]` | cmux 内で常駐。キューを監視し、行があれば起動する。ログを stdout に吐く |
| `cclaunch add [-C <dir>] "<prompt>"` | 1 行 append。`-C` 省略時は cwd を推論する |

並べ替え・削除・一覧は `$EDITOR ~/.cclaunch/queue.jsonl` に丸投げする。
`run` は `fs.watch` でファイルを見ているので、他の端末からの `add` も編集も即座に反映される。

## web フォーム (`--port`)

複数行のプロンプトはシェルで打つのが辛い。`--port` を付けると `run` が 127.0.0.1 に
textarea 1 枚のフォームを出す。**やることは `add` と同じ — queue に 1 行 append するだけ**で、
cmux には触らない。したがって「cmux を叩くのは runner だけ」の不変条件は保たれ、
web を足しても常駐プロセスは増えない (`src/add.ts` の `enqueue` を CLI と共有する)。

一覧・削除・並べ替えは載せない。`$EDITOR` に丸投げする方針は web でも変わらない。
そもそも積んだ行は runner が即座に起動して消すので、表示しても一瞬しか映らない。

## cwd の推論

思いついた時に repo にいるとは限らない。`-C` を省いたら、prompt から起動先を Claude に選ばせる。

1. `roots` 以下を `depth` まで走査し、`.git` を持つディレクトリを候補として集める (`.git` があればそこで打ち切る。repo の中は repo の問題であって別の候補ではない)
2. 候補リストと prompt を `claude -p --model haiku` に渡し、1 パスだけ返させる
3. **返答が候補リストの要素であることを検証する**
4. 落ちたら候補を並べて `-C` を要求する

3 が肝で、これが無いと存在しないパスで claude が黙って起動しうる。同じ理由で、選べなかった時に
cwd へフォールバックもしない。意図しない場所で起動されるのが一番困る。

判断材料はパス名だけ。README や直近のコミットまで渡せば精度は上がるだろうが、候補列挙が重くなる。
`~/src/github.com/<owner>/<repo>` のような階層なら repo 名で当たる。外したら積んだ直後のログに
フルパスが出るので、その場で `$EDITOR` で直せる。

推論を **add 時**に済ませるのは、キューの不変条件 (1 行に起動に必要な情報が全部揃っている) を
保つため。run 時に遅延解決すると、runner が変わる上に、外した推論に気づくのが「間違った repo で
claude が起動した後」になる。

## 設定

`~/.cclaunch/config.json` (`src/config.ts`)。無ければ既定値、部分指定も可。

```json
{ "roots": ["~/src"], "depth": 4, "port": 4747 }
```

読むのは config だけ、使うのはそれぞれ。`pick` は `{roots, depth}` を**引数で受け取る**ので、
config ファイルの存在を知らない (テストからも素の値を渡せる)。`web` も同様に port を引数で受ける。
設定の出所が一箇所に集まっていれば、項目が増えても触るのは config.ts だけで済む。

## 起動フロー

1. 先頭行を読む
2. `cmux list-workspaces` に `cclaunch-<id>` が居ないか確認する（居たらスキップして 4 へ）
3. `cmux new-workspace` を **await して終了コードを見る**
4. 成功したら残りを temp file に書いて `rename`（アトミック）

### exactly-once

**行を消すのは spawn が成功してからにする**（at-least-once）。逆順にすると、
spawn が失敗した時にタスクが消滅する。二重起動はだるいがクリティカルではない一方、
取りこぼしは黙って失われるので許容できない。

この順序だと重複が起きるのは「cmux が成功して返った後、rename する前に runner が死んだ場合」だけ、
つまり数ミリ秒の窓に限られる。実質 exactly-once になる。

その窓も潰すのが手順 2。タスク id をワークスペース名にしておけば、クラッシュ復帰時に
「既に起動済みか」を cmux 自身に問い合わせられる。
ワークスペース名が付くこと自体、cmux 上でどのタスクか見分けるのに役立つので、
dedup 目的がなくても入れる価値がある。

## 決着した未決 (cmux 0.64.17)

- **ワークスペース名**: `new-workspace --name` がある。`rename-workspace` の後追いは不要。
- **prompt のクォート**: `--command` は「シェルに text+Enter を送る」もので、argv ではない。
  したがってシェルクォートは必須。`'` を `'\''` に置換する POSIX の単引用符エスケープで囲む
  (`shellQuote` in `src/cmux.ts`)。`--cwd` があるので `cd <cwd> &&` は要らない。
- **dedup**: `cmux workspace list --json` の JSON から name/title を再帰的に集めて突き合わせる。
  形を決め打ちすると、外した時に「起動済み」と誤判定してタスクを黙って捨てる。そこだけは寛容に読む。
