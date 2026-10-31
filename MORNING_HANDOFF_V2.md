# Post and Paid V2 — creator rızası ve intake

**V1 korunuyor; V2 mühendislik kapsamı hazır, yeni creator-post pilotu PENDING.** Son kontrol31 Ekim2026, 04:59 Europe/Berlin. Kontrol edilen bir X hesabı/yeni insan gönderisi sağlanmadı. Tarihsel post20 yeni creator rızası veya yeni pilot gibi sunulmuyor.

- **V1:** http://localhost:3106/ — tamamlanmış tarihsel kaynak/ödeme akışı.
- **V2:** http://localhost:3106/next — creator consent + yeni post intake akışı.
- **Repo:** https://github.com/ABerkeBora/heka-post-and-paid ; V2 branch `codex/next`, uygulama commit `3fe3eda9cd06b8b6c5b1106e073f1bf582a93a24`.
- **V1 baseline:** `3dac6e4a397c9719c8e05c6639550a0260ce040d`, kayıpsız `v1-baseline` tag'i. BASELINE_V1.md çalışma komutlarını, contract'ları ve eski veri/kanıt konumlarını kaydediyor.

## V1–V2 farkı ve öneri

| | V1 `/` | V2 `/next` |
| --- | --- | --- |
| Müşteri değeri | Sabit koşullu snapshot creator ücretini açar | Creator'ın cüzdan rızasını ve gönderideki beneficiary/nonce bağını da ister |
| Author–wallet bağı | Markanın önceden pinlediği input | Tam EIP-712 şartlarına creator imzası + tam challenge içeren source-attested post |
| Gerçek tamamlanmış akış | Ücretli API3 snapshot, agent payout, dört gerçek revert ve restart/duplicate kanıtı var | Gerçek yeni creator postu/intake/funding/payout **PENDING** |
| Kayıt ve fonlar | Eski state/intent/receipt/escrow korunuyor | `/api/next/`, `.local/v2/`, ayrı executor nonce'u ve ayrı factory |

**Şu anki sunum önerisi: V1.** V1'in uçtan uca gerçek payout'u ve dört gerçek ret receipt'i hazır. V2 daha güçlü müşteri rızası sağlar, ancak yeni creator pilotu olmadan onun yerine tam canlı akış diye sunulmamalı. Sabah gerçek postla V2 pilotu tamamlanırsa öneri tekrar değerlendirilebilir; kullanıcı iki sürümü doğrudan karşılaştırabilir.

## Yeni akış

Campaign challenge üret → creator kendi hesabında tam nonce/beneficiary fragment'ını yayımlar → post ID pinlenir → creator tam şartları kendi EVM cüzdanıyla imzalar → signed source intake doğrulanır → marka aynı şartları fonlar → tek bounded agent yetkisiyle taze snapshot ve uygun payout yürür.

Creator imzası domain/version, Base Sepolia chain ID, factory, agreement ID, brand, beneficiary, author/post ID, nonce, native ücret/asset, tam metin koşulu, publication window, claim/consent deadline ve freshness sınırına bağlıdır. Sözleşme imzadan beneficiary recover eder. Değişmiş şart, başka domain/chain, expired/replayed consent veya eksik challenge fonlanmış escrow oluşturmaz.

Factory, önce source intake'i doğrular; sonra değişmeyen V1 escrow'unu oluşturur. Uygulama payout için fonlamadan sonra ayrı bir snapshot satın alır. Değişmeyen child `timestamp >= fundedAt` uygular: önceki saniyeye ait intake reddedilir, aynı saniyeli intake on-chain geçebilir. Tamamen yeni envelope şartı uygulama politikasıdır; on-chain garanti değildir. Child'ın `brand()` değeri factory'dir; asıl brand factory registry'sinde sabittir. Deadline refund'u yalnız asıl brand'e, tam bu child'ın ücreti kadar ve atomik olarak yönlendirilir.

Ücretler ayrı: intake snapshot **0.01 aUSD**, payout snapshot **0.01 aUSD**, toplam API cap **0.02 aUSD**; creator collateral **0.00001 test ETH**; gas ayrıca. Test executor'a hazırlık transferi, müşteri ödemesi/pilot kanıtı sayılmaz. Reddedilmiş bir source cevabının daha önce ödenmiş dış API ücreti veya revert gas'ı geri dönmüş sayılmaz.

## Kanıt ve son kontrol durumu

| Kontrol | Durum / konum |
| --- | --- |
| Yeni contract testleri | **PASS —56/56**; test/PostAndPaidConsentFactory.t.sol |
| V1+V2 contract regresyonu | **PASS —81/81**; V1 kaynakları/compiler/testleri değişmedi |
| EIP-712 hash uyumu | **PASS** — bağımsız viem struct-hash vektörü ve EOA signature recovery |
| Consent alan/domain/chain/expiry/replay retleri | **PASS** — yeni contract testleri; retler child/collateral/payout oluşturmuyor |
| Source/challenge ve dört tamper sınıfı | **PASS (ayrılmış contract fixture testleri)**; canlı V2 pilotu yerine sayılmıyor |
| Ayrı executor hazırlığı | evidence/v2/isolated-wallets.json; private key yok, yalnız adres ve test-fon allocation receipt'leri |
| Yeni factory deployment | **PASS** — factory `0x55f8b95e4ab02550b9758e23187fc366b91f910e`; [tx](https://sepolia.basescan.org/tx/0x38c3148701bce6fe8d504d4f2a3c25b024538fd9d1dd80f644caa2eeed4bca2b); deployment-verification.json:27 read-only bytecode/domain/signer kontrolü |
| Gerçek test-wallet imzası / source negatif kanıtı | **PASS** — wallet-consent.json: deployed factory hash/recovery ve12 ret; browser-consent-verification.json: gerçek EOA imzası harici formdan kabul edildi. missing-challenge.json: gerçek0.01aUSD snapshot ve MissingChallenge revert, escrow/nonce/funds değişmedi |
| TypeScript/build, `/` regresyonu ve `/next` browser QA | **PASS** —59/59 TS,81/81 Foundry, production build; v1-regression.json:7 runtime dosyası/31 eski kaynak-kanıt byte'ları ve paid chain state aynı; browser-qa.json ve desktop/tablet/phone screenshots |
| Gerçek yeni creator pilotu ve V2 payout | **PENDING — dış insan gönderisi yok** |

Mevcut kurulum hazırdır; sabah bu setup/negatif test komutlarını tekrar çalıştırmak gerekmez. Yeniden üretim için: `npm run next:prepare`, `npm run next:deploy`, `npm run next:consent-test`, `npm run next:negative`; test gas/API ücreti tüketebilirler. Üretim açılışı mevcut `npm run build` ve `npm start`; V1 ve V2 aynı3106 portunda ayrı route/API/state kullanır. Tüm yeni kamuya açık kanıtlar `evidence/v2/` altında tutulur. Eski `.local/` veya receipt'ler silinmez; belirsiz intent yeni authorization ile tekrar ücretlendirilmez.

## Tek küçük sabah adımı

**Creator `/next` sayfasındaki tam challenge'ı kendi X hesabında yayımlayıp post ID'yi intake'e versin.** Yaklaşık3–5 dk. Sonraki cüzdan imzası, intake, marka fonlaması ve tek agent başlangıcı normal ürün adımlarıdır. Kullanıcı adına paylaşım, üçüncü kişiye mesaj, yeni sponsor, hosting, mainnet veya yarışma submission'ı yapılmadı.

## Güven ve tamamlanma sınırı

Cüzdan imzası tek başına X hesabı sahipliğini kanıtlamaz; source-attested exact author/post/challenge bağı da gerekir. API3 imzası kaynağın tam cevabını doğrular; X/TwitterAPI.io cache ve doğruluk riski kalır. Publication zamanı kontrol edilir, bağımsız upstream observation timestamp yoktur. Kesintisiz yayın, reklam ilişkisi/kalitesi veya mevzuat uygunluğu iddia edilmez.

API/gas bütçesi yerel executor limitidir; genel on-chain session allowance değildir. On-chain creator rızası, pinlenmiş source/intake ve tek payout ayrı sınırdır. Gas preflight L1/operator fiyat değişimini mutlak on-chain toplam tavanına dönüştürmez. EOA typed-data imzası desteklenir; ERC-1271 platformu eklenmedi.

Brief'in açık no-account bitiş sınırı; çalışan challenge/intake, gerçek test-wallet imzaları, ayrılmış contract/source testleri ve bu tek sabah creator adımıdır. Gerçek pilot/payout bundan ayrı **PENDING** kalır. V1'in video kaydı ve Devfolio teslimi de henüz tamamlanmadı; tüm yarışma teslim şartları sağlanmış gibi sunulmuyor.

## Doğrudan inceleme ve sunum

V1 [http://localhost:3106/](http://localhost:3106/) çalışır ve gerçek payout/dört gerçek ret kanıtını gösterir. V2 [http://localhost:3106/next](http://localhost:3106/next) yeni creator bilgilerine hazırdır. Aynı sunucu iki route'u3106 portunda açar; durmuşsa proje dizininde `npm start`. Taze kurulumda `npm ci`, `forge build`, `.env.example` üzerinden yerel env, `npm run build`, `npm start`. [V1 tag](https://github.com/ABerkeBora/heka-post-and-paid/tree/v1-baseline), [V2 branch](https://github.com/ABerkeBora/heka-post-and-paid/tree/codex/next). Kısa karşılaştırma REVIEW_SUMMARY.json içindedir.

Öneri **V1 / düşük sunum riski**: gerçek uçtan uca ödeme ve dört gerçek revert kaydı tamam. V2'nin creator rızası daha güçlüdür; gerçek yeni paylaşım ve payout olmadan aynı canlı tamamlanmışlık iddiası taşımıyor.

Gerçek negatif veri [ödemesi](https://sepolia.basescan.org/tx/0xbacff4be2fc37239668fb5b9fff76f8f03c2617faad859773d53714ccf6a4094), [funding revert'i](https://sepolia.basescan.org/tx/0x858cddd1ac99b22dfe9f6ab9aa9a01ccba66fb63f2fdc1b71de03e735ecba5ef). Revert848958002466wei gas tüketti; API ücreti0.01aUSD kaldı. Factory/creator bakiyesi0, nonce unused, child yok. Yeni executor'da0.09aUSD kaldı; kalan gas ve oracle ücretleri yeni pilot öncesi normal preflight ile kontrol edilir. Test imzasının kendi test key'imizle üretilmesi gerçek insan creator rızası anlamına gelmez. Tarayıcıda harici imza formu sınandı; EIP-1193 extension popup yolu canlı sınanmadı.

###150 saniyelik kayıt taslağı

-0–20sn: marka–creator sabit şartları; veri sahteyse yanlış ücret serbest kalma riski.
-20–75sn: V1 ücretli snapshot→tek agent payout ve ayrı API/creator/gas receipt'leri.
-75–115sn: V1 geçerli sonuç ve dört gerçek edited/stale/wrong-request/wrong-signer ret receipt'i; collateral değişmez.
-115–140sn: V2 exact challenge, wallet terms/hash/recovery ve gerçek MissingChallenge reddi. Gerçek creator pilotunun PENDING olduğunu söyle.
-140–150sn: public repo, setup, oracle/cache güven sınırı ve sabah creator adımı.

V2 ek submission metni: “Post and Paid binds a creator's EOA consent to fixed campaign terms, a unique nonce, a beneficiary wallet and a particular X author/post. An immutable API3 verifier requires the exact signed post challenge before funding. After one bounded delegation the executor buys a separate signed snapshot and submits the eligible one-time payout. V1 has real paid-data, payout and four real tamper-rejection evidence. V2 has deployed consent verification, real test-wallet signatures and a paid missing-challenge rejection; a human new-post pilot remains pending. Users rely on signed source data to avoid releasing the agreed creator fee on forged delivery evidence. Independent upstream observation time and continuous-publication evidence were unavailable in the chosen listing.”

### Kalan zorunlu işler

1. **PENDING gerçek V2 pilotu:** creator kendi hesabında tam challenge'ı paylaşır/post ID verir (3–5dk dış adım); ardından normal wallet→intake→fund→agent akışı (yaklaşık5–10dk). Canlı V2 pozitif action ve yeni dört-case qualification dizisi şu an tamam sayılmaz; TRACK_REQUIREMENTS_V2.md bunu ayrı işaretler.
2. **PENDING video ve Devfolio:**150sn kaydı hazırlayıp kullanıcı tek takım entry'sinde seçtiği proje/track ile31 Ekim15:00 Europe/Berlin'den önce gönderir (15–30dk). Başvuru yapılmadı. Resmi API3/general kuralları04:55CET tekrar okundu; değişiklik görülmedi.

Final read-only güvenlik incelemesi evidence/v2/final-review.md içindedir. Yayın ağacı gerçek seçili-proje/V2 secret değerleriyle tarandı (publication-check.json:0 eşleşme); interface-lint.txt:0 FAIL/3 gerekçeli WARN. V1 state/intent/mandate/kanıtları korunmuştur; V2 QA kampanyaları yalnız unfunded test verisi olarak `.local/v2/archive/` içine alınmıştır. Zincir geçmişi ve public negatif kanıt silinmedi.

Gerçek V2 Goal durumu: **COMPLETE**, `01a18fd2-7f66-7161-bf53-a9bc9e8fd2b0`,31 Ekim04:59:33CET;28dk15sn. Bu mühendislik tamamlanması, yukarıdaki PENDING gerçek creator pilotu veya yarışma başvurusu tamamlandı demek değildir.
