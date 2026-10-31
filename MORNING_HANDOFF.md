# Post and Paid — sabah teslimi

**Yerel ürün ve gerçek ödeme akışı incelemeye hazır.** İnceleme hedefi 31 Ekim 08.00–09.00 Europe/Berlin; iş erken tamamlandı. Yarışma başvurusu henüz tamamlanmış değildir: video ve Devfolio teslimi aşağıda PENDING.

- Aç: **http://127.0.0.1:3106** — production server çalışıyor.
- Repo: https://github.com/ABerkeBora/heka-post-and-paid — public kaynak ve push doğrulandı; default branch `codex/build`.
- Yeniden başlat: proje kökünde `npm start`. İlk kurulum: `npm ci`, `forge build`, `npm run build`; README tam ve bağımsız.
- UI İngilizce. Anahtarlar ve kalıcı intent kayıtları ignored yerel dosyalarda; repoya taşınmadı. Test ağından başka ağ veya gerçek değer harcaması yok.

## Çalışan akış

Marka tek gönderi, sabit creator, ücret, kaynak, metin ve tarih şartlarıyla escrow'u fonlar. `Start procurement agent` bir kez verildikten sonra yerel qwen3:4b izinli veri alımını önerir; deterministic executor 0.01 aUSD'lik TwitterAPI snapshot'ını satın alır, imzayı ve policy'yi kontrol eder, contract'a sunar. Contract sabit creator'a **0.00001 test ETH** öder. Sonraki payout için ayrı insan tıklaması yok.

Biri CLI, biri gerçek browser üzerinden iki tam ödeme çalışması geçti. Ekran şu an browser çalışmasının Paid sonucunu gösteriyor. Yeni pozitif gösterim için `New agreement → Fund agreement → Start procurement agent`; tarihî receipt'ler korunur. Eski snapshot'ı tekrar kabul ettirmeye çalışmayın: pozitif kanıtın tazeliği ödeme anına aittir.

## Gerçek kanıt

| Kanıt | Konum / bağlantı |
| --- | --- |
| İlk contract | [0xffb396…484117](https://sepolia.basescan.org/address/0xffb396146f2443210b93ecb98c122e6a52484117) |
| Browser contract | [0x7d4f7f…00a240](https://sepolia.basescan.org/address/0x7d4f7f937cc3e2f3e39c87418d2c51355100a240) |
| Browser agent veri ödemesi | [0xabd1…5d02](https://sepolia.basescan.org/tx/0xabd1b156afc1f05cc500aa77d1adea3d7ff95c7c2caf68c0c640f62fdcb95d02) |
| Browser creator payout | [0x48c5…edff](https://sepolia.basescan.org/tx/0x48c5ac28cd66f42f18e139586cba38783c3e6cbea59337469df1132ace66edff) |
| Dört gerçek revert + korunan collateral + refund | evidence/tamper.json |
| Bytecode, signer, request ve CreatorPaid bağı | evidence/deployment-check.json |
| Restart/duplicate ve değişmeyen bakiyeler | evidence/restart-duplicate.json |
| Tam intent/mandate/model/receipt özeti | evidence/live-flow.json; evidence/runs/ |
| Görsel QA | evidence/browser-qa.json; evidence/screenshots/ |

Ret harness'ı aynı contract koduyla 30 saniye freshness ve 180 saniye deadline kullanır; ana anlaşma 300 saniye freshness kullanır. Stale testinde gerçek timestamp değiştirilmeden beklenmiştir. Harness collateral'ı dört reddin ardından korunmuş, deadline sonrasında markaya iade edilmiştir. UI kayıtlı testleri özgün zaman ve contract bağlantısıyla işaretler.

Toplam kayıtlı dış veri gideri: **0.03 test aUSD** (bir source preflight + iki procurement). İki ayrı creator ödemesi toplam **0.00002 test ETH**. Bunlara deployment, proof ve revert gas'ları ayrıca eklenir. Gas kayıtları Base L2 execution, L1 data ve operator fee'lerini ayırır.

## Çalıştırılan kontroller

- **25/25 Forge** test: signer/request/time/predicate, payout, replay, refund, reentrancy, transfer-failure rollback.
- **33/33 ödeme** testi: cap, recipient/network/asset, expiry, reserved budget, cache, exact token receipt ve unresolved retry.
- TypeScript ve production build **PASS**; dependency audit **0 bulgu**.
- Gerçek browser: fresh agreement/funding/tek agent yetkisi/payout; payment trail; inline malformed-proof reddi.
- 1440×900, 768×1024, 390×844 ekranlar **PASS**. Yatay overflow yok; font yüklü, <11px metin ve gradient yok. Metin kontrastı ölçüldü.
- Salt okunur, anahtarsız yeni açılış kayıtlı gerçek kanıtı gösteriyor; ekonomik kontroller kapalı.
- Cross-origin POST, yanlış Host ve JSON dışı ekonomik istek reddediliyor.
- TasteSkill source lint: **0 FAIL**, IDs/code monospace ve boş-değer çizgileri için açıklanmış 4 WARN (iki tür: üç code-font ve bir missing-value uyarısı). `inspect.mjs` yerine desteklenen CUA browser ölçümleri kullanıldı.

## Kalan zorunlu teslimler

| İş | Durum ve etki | En küçük sabah adımı |
| --- | --- | --- |
| En çok 2.5 dakikalık video | **PENDING** — yarışmanın video teslim şartı karşılanmadı | SUBMISSION.md 2:30 planıyla gerçek akış ve dört receipt'i kaydet, URL ekle. Yaklaşık 10–15 dk. |
| Devfolio entry ve metin | **PENDING** — taslak hazır, başvuru gönderilmedi | Kullanıcının seçtiği tek takım adayı için metni/video/repo/contract bağlantılarını Devfolio'ya yerleştir; ayrıca gönderim yetkisi gerekir. Yaklaşık 5–10 dk. |
| Public source push | **PASS** | `codex/build`, ABerkeBora author/committer ve PUBLIC görünürlük doğrulandı. |

Resmî API3 sekmesi ve genel şartlar **04.02 Europe/Berlin** yeniden okundu. Yayımlanan deadline **31 Ekim 15.00 Europe/Berlin**; takım başına tek entry, en çok üç partner track. Teknik kanıtlar PASS olsa da video/entry tamamlanmadan tüm yarışma şartlarının sağlandığı söylenmiyor. Kriter tablosu TRACK_REQUIREMENTS.md'de.

## Güven sınırları ve kapsam

Tarihî public post yalnız teknik test senaryosudur; gerçek reklam teslimatı veya hesap sahibinin bu test beneficiary cüzdanına sahip olduğu iddia edilmez. Hesap–cüzdan ilişkisi marka input'udur. İmza kaynağın tam cevabını doğrular; X/TwitterAPI.io cache/doğruluk riski kalır. Publication zamanı ayrı kontrol edilir; bağımsız upstream observation timestamp bulunmadı. Kesintisiz yayın, kampanya kalitesi veya reklam mevzuatı uygunluğu kanıtlanmaz.

API/gas bütçesi yerel executor limitidir. Contract sabit creator/ücret/istek/koşullar ve tek payout'u enforce eder. Gas preflight L1/operator fiyat değişimini mutlak on-chain toplam tavanına dönüştürmez. Belirsiz ödeme sonucu yeni authorization ile otomatik denenmez; `.local/` kayıtlarını silmeyin, `npm run reconcile` ve receipt incelemesini kullanın. Eksik veya geçersiz source verisi escrow'u açmaz; daha önce ödenmiş API ücreti geri dönmüş sayılmaz.

Tek anlaşma job'u tamamdır; zamanlanmış tekrarlı otonom döngü bonusu iddia edilmiyor. BSV/Cardano, hosted deployment ve kullanıcı adına sosyal paylaşım eklenmedi.
