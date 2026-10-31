# Post and Paid — API3 şartları ve gerçek kanıt

- Seçilen sponsor track'i: yalnız **API3 — Any API in your contract**.
- Başlangıç kapısı: **31 Ekim 2026 03.40 Europe/Berlin**, uygulama kodundan önce. Tarayıcıda API3 sekmesi seçildi; About, What to submit, What judges look for, Example ideas ve genel submission okundu. Resmî starter/guide takip edildi.
- Bitiş recheck: **31 Ekim 2026 04.02 Europe/Berlin**. Sayfa yeniden yüklendi, genel kurallar ve gerçek API3 sekmesi tekrar açılıp genişletildi. Aşağıdaki yükümlülüklerde değişiklik görülmedi. Varsayılan BSV içeriği kullanılmadı.
- Teknik entegrasyon kanıtları PASS. **Video ve Devfolio teslimi PENDING**; tüm yarışma teslim şartlarının tamamlandığı iddia edilmiyor.

## Resmî kaynaklar

- https://hackathon.tum-blockchain.com/prizes#api3
- https://hackathon.tum-blockchain.com/prizes#how-to-submit
- https://api3dao.github.io/airnodehub-hackathon/docs/
- https://api3dao.github.io/airnodehub-hackathon/docs/integrations
- https://api3dao.github.io/airnodehub-hackathon/docs/from-api-to-contract
- https://api3dao.github.io/airnodehub-hackathon/docs/projections
- https://github.com/api3dao/airnodehub-hackathon-starter/tree/52933ae1fb9371446a927338473466c3d320e19a
- https://airnodehub.api3.org/explore/twitterapi
- https://airnode-twitterapi.fly.dev/

## Zorunlu teknik qualification

| Şart | Uygulama | Gerçek kanıt | Durum |
| --- | --- | --- | --- |
| Hub verisi ana iş için gerekli | İmzalı gönderi olmadan creator escrow'u ödenemez | contracts/PostAndPaidEscrow.sol; gerçek iki payout; eksik/geçersiz veri unit testleri | PASS |
| Deploy edilmiş sözleşmede beklenen signer | Değişmez Airnode adresi; EIP-191 doğrulaması | evidence/deployment-check.json; kaynak bytecode'u deployment input'u ile eşleşiyor | PASS |
| Tam isteğe bağ ve uygun zaman denetimi | Contract post ID'den sabit operation/parametre/projection hash'i türetiyor; funding sonrası imza, envelope yaşı, publication window | İki gerçek signed envelope, beklenen request hash; test/PostAndPaidEscrow.t.sol | PASS |
| İmzalı değer anlamlı zincir eylemi doğuruyor | Kimlik/metin/tarih koşulları sabit creator'a native fee aktarımını tetikliyor | evidence/runs/agreement-1b0bda02.json; evidence/live-flow.json; CreatorPaid ve 10000000000000 wei artış doğrulandı | PASS |
| Gerektiği yerde duplicate koruması | Tek Paid/Refunded state geçişi; sabit beneficiary; kalıcı intent/nonce | evidence/restart-duplicate.json; kontrat replay/reentrancy testleri | PASS |
| Gerçek verinin değiştirilmesi reddediliyor | Orijinal payload'da text değeri değiştirildi | evidence/tamper.json, Edited value; gerçek reverted tx | PASS |
| Gerçek eski cevap reddediliyor | Orijinal signed timestamp değiştirilmeden bekletildi | evidence/tamper.json, Stale response; ResponseTooOld reverted tx | PASS |
| Farklı gerçek istek cevabı reddediliyor | Aynı postun projection'sız ücretli cevabı sabit projection hash'i yerine sunuldu | evidence/source-preflight.json; Different request reverted tx | PASS |
| Beklenmeyen signer reddediliyor | Cevap geçici farklı key ile imzalandı; key yayımlanmadı | Wrong signer reverted tx; beklenen signer sabit | PASS |

Ana anlaşma freshness sınırı **300 saniye**. Dört canlı ret işlemi aynı bytecode'lu ayrı fonlanmış harness üzerinde, önceden pinlenmiş **30 saniye freshness / 180 saniye deadline** ile yürütüldü. Tüm retlerde harness state=Active ve 1000000000 wei collateral değişmedi. Sonraki deadline refund'u ayrı receipt'tir. Bayatlık için timestamp düzenlenmedi. Unit signer fixture'ları bu canlı kanıtların yerine sayılmadı.

## Track'e özel ve genel teslim yükümlülükleri

| Madde | Kanıt / kalan iş | Durum |
| --- | --- | --- |
| Contract adresi ve ağ | README; evidence/deployment-check.json; Base Sepolia 84532 | PASS |
| Jürinin kendi response'unu sunabilmesi | UI Submit proof; scripts/submit-proof.ts; README, --check-only --contract; permissionless ABI | PASS |
| Veri kullanıcıları, forgery etkisi ve bulunamayan veri açıklaması | SUBMISSION.md; continuous publication, upstream observation time ve account-wallet proof sınırları açık | PASS (taslak) |
| Public kaynak ve setup/run README | Repo oluşturuldu; source push doğrulaması teslimin son adımı | PENDING |
| En çok 2.5 dakikalık videoda pozitif akış + dört ret | SUBMISSION.md 2:30 akış ve gerçek receipt'ler hazır; video kaydı yapılmadı | PENDING |
| Devfolio'da detaylı proje açıklaması ve entry | İngilizce metin taslağı SUBMISSION.md; kullanıcı adına başvuru gönderilmedi | PENDING |
| Deadline ve takım kapsamı | 31 Ekim 2026 15.00 Europe/Berlin tekrar doğrulandı; takım başına tek entry, en çok üç partner track | PASS (kural kontrolü) |

## Kullanıcının agentic-payment kabulü

| Kabul | Kanıt | Durum |
| --- | --- | --- |
| Bir ilk yetkiden sonra gerçek ekonomik eylem | İki ayrı gerçek çalışmada agent x402 ücretini ödedi ve creator payout transaction'ını kendisi gönderdi; ikinci çalışma browser üzerinden | PASS |
| Integer ağ/asset/alıcı/bütçe/gas/expiry/max-action sınırı | Persisted mandate; source recipe ve creator sabit; UI onaydan önce caps gösteriyor | PASS |
| Model anahtar veya serbest transaction seçmiyor | Yerel qwen3:4b structured purchase_snapshot önerisi; deterministic validator; evidence proposal | PASS |
| Retry/restart ikinci ücret veya ödeme üretmiyor | EIP-3009 nonce/receipt reconciliation, exact signed tx; fresh-process duplicate + cached-response kontrolü | PASS |
| Bütçe veya yanlış alıcı reddi | 10001 > 10000 ret; 33 ödeme testi asset/network/recipient/expiry/reservation/cache/receipt kontrolleri | PASS |
| API ücreti / collateral / gas ayrılıyor | Gerçek receipt'ler; execution + L1/operator ücret uzlaştırması; revert gas ve dış API ücretine refund iddiası yok | PASS |

API/gas bütçeleri yerel executor tarafından uygulanır; genel on-chain session allowance değildir. Gas preflight signed L2 maximum ile buffered mevcut L1/operator tahminlerini denetler; inclusion öncesi L1 fiyatı değişebilir. Creator, ücret, request, veri koşulları ve tek payout contract'ta enforce edilir.

## Opsiyonel jüri tercihleri ve sınırlamalar

- +10 agent bonus'u için tekrarlı, zamanlanmış otonom döngüler isteniyor. Bu sürüm tek anlaşma için tek yetkili procurement+payout job'u yapar. İki ayrı kullanıcı başlangıçlı çalışma, tekrarlı zamanlanmış döngü bonusu diye sunulmuyor.
- X/TwitterAPI.io/API3 upstream doğruluğu ve cache davranışı güven varsayımıdır. `createdAt` publication time'dır; bağımsız upstream observation timestamp yoktur. Envelope freshness bunların yerine geçmez.
- Tarihî public post teknik testtir; reklam ilişkisi, creator rızası veya hesap–cüzdan sahipliği kanıtı değildir. Kesintisiz yayın ve kampanya kalitesi iddiası yoktur.
- BSV/Cardano eklenmedi. Hosted yayın ve yarışma submission'ı yapılmadı.
