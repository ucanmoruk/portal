# Proje notları

Buraya hedefleri, öncelikleri ve yapılacakları yazın. AI asistan bu dosyayı okuyarak adım adım ilerleyebilir.

## Şu an odak

- Hizmet planları

## Yapılacaklar

Laboratuvar menüsü içerisine bir "Hizmet Takip" sayfası oluşturalım. Numune Kabul'ün hemen altında bulunsun. Buraya bir tablo, sayfalama ve arama fonksiyonları aktifleştirelim.

Bu sayfada Evrak No, Rapor No, Ürün Adı, Hizmet, Metot ve Termin tarihi olmalı.
Burada gruplama özelliğini yapabiliriz. 
Hizmetlerin farklı Raporlama şablonları olacak. Bunu da StokAnalizListesi tablosunda RaporFormati sütununda belirttik. Bu şablonlara göre numunelerin raporları yazdırılacak.
Buna uygun bir tasarım oluşturma konusunda bana yardımcı ol.



Rapor Takip sayfası oluşturalım. Laboratuvar menüsü içinde Numune Kabul sekmesinin altında oluştur. 

Burada bir tablo oluşturacağız. Tabloda sayfalama ve arama özelliğini aktifleştir. "Numune Kabul" sayfasını aynen kopyala. Evrak No üzerine tıkladığımız zaman açılan sekmede 

Buradaki tabloyu revize edeceğiz.

Tabloda liste şu şekilde olmalı "Tarih, Evrak No, RaporNo, Firma/Proje, Numune Adı, Rapor Türü, Rapor Durumu, Yazdır Butonu, Gönder Butonu" ve burada her bir satır tıklanabilir olmalı. Tıklanınca açıldığında ise 2. seviye listeleme yapılmalı.

Bu listelemede ise rapor türüne ait hizmetler görüntülensin. (Kod, Ad, Metot, Birim, Sonuç, Limit, Değerlendirme). Buradaki tabloda sonuç yerine değer girilip, kaydedilebilmeli.

Rapor türü "StokAnalizListesi" tablosundaki RaporFormati sütunundaki değere göre belirlensin. Şuan için 4 tane farklı rapor formatı mevcut. Bu formatları sonrasında ayrı ayrı ele alacağız. 



1. seviye listeleme -> Tarih, Evrak No, RaporNo, Firma/Proje, Numune Adı, Rapor Türü, Rapor Durumu, Yazdır Butonu, Gönder Butonu 
2. seviye listeleme -> rapor türüne ait hizmetler görüntülensin. (Kod, Ad, Metot, Birim, Sonuç, Limit, Değerlendirme)