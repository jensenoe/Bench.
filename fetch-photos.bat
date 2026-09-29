@echo off
setlocal
cd /d "%~dp0public\terrain"
title Fetch photographs
echo.
echo   Fetching 334 photographs (Pexels and Unsplash, free licences).
echo   Twelve libraries from the Alps to Edinburgh, plus Lunch and Cockpit covers.
echo   Existing files are skipped, so rerunning is cheap. Pictures no longer in the
echo   library are removed at the end.
echo.
where curl >nul 2>&1
if errorlevel 1 ( echo   curl.exe not found. It ships with Windows 10 1803 and later. & pause & exit /b 1 )
set MANIFEST=%TEMP%\bench-photos.txt
(
echo alps-dawn-675251.jpg
echo alps-dawn-803028.jpg
echo alps-dawn-35003423.jpg
echo alps-dawn-14503719.jpg
echo alps-dawn-11334345.jpg
echo alps-dawn-826827.jpg
echo alps-day-940916.jpg
echo alps-day-37072357.jpg
echo alps-day-33461144.jpg
echo alps-day-27139098.jpg
echo alps-day-19138473.jpg
echo alps-day-27111966.jpg
echo alps-day-12266764.jpg
echo alps-day-33208207.jpg
echo alps-dusk-24552030.jpg
echo alps-dusk-21545525.jpg
echo alps-dusk-28127032.jpg
echo alps-dusk-20938373.jpg
echo alps-dusk-18991371.jpg
echo alps-dusk-25478720.jpg
echo alps-night-9202295.jpg
echo alps-night-30972885.jpg
echo alps-night-31050106.jpg
echo alps-night-28304734.jpg
echo alps-night-20220326.jpg
echo alps-night-30052796.jpg
echo alps-night-36575404.jpg
echo alps-night-35633687.jpg
echo tropics-dawn-33099466.jpg
echo tropics-dawn-32191652.jpg
echo tropics-dawn-30948081.jpg
echo tropics-dawn-2583847.jpg
echo tropics-dawn-733092.jpg
echo tropics-dawn-2563174.jpg
echo tropics-dawn-2494132.jpg
echo tropics-dawn-4100133.jpg
echo tropics-dawn-12321837.jpg
echo tropics-day-4602246.jpg
echo tropics-day-4602243.jpg
echo tropics-day-16671590.jpg
echo tropics-day-10740706.jpg
echo tropics-day-16710718.jpg
echo tropics-day-38370402.jpg
echo tropics-day-6559967.jpg
echo tropics-day-4327832.jpg
echo tropics-day-31421280.jpg
echo tropics-day-8356055.jpg
echo tropics-day-10490906.jpg
echo tropics-dusk-34614903.jpg
echo tropics-dusk-34819159.jpg
echo tropics-dusk-5728395.jpg
echo tropics-dusk-36593818.jpg
echo tropics-dusk-9548239.jpg
echo tropics-dusk-7987859.jpg
echo tropics-dusk-8239960.jpg
echo tropics-dusk-2260967.jpg
echo tropics-dusk-9482126.jpg
echo tropics-night-9482120.jpg
echo tropics-night-1724417.jpg
echo tropics-night-4179962.jpg
echo tropics-night-1724428.jpg
echo tropics-night-37240654.jpg
echo tropics-night-1724422.jpg
echo tropics-night-29614936.jpg
echo tropics-night-12387870.jpg
echo tropics-night-8022651.jpg
echo tropics-night-3048211.jpg
echo urban-dawn-35496265.jpg
echo urban-dawn-17393436.jpg
echo urban-dawn-11545441.jpg
echo urban-dawn-18140246.jpg
echo urban-dawn-4217092.jpg
echo urban-dawn-35984234.jpg
echo urban-day-14117491.jpg
echo urban-day-38602763.jpg
echo urban-day-29123787.jpg
echo urban-day-20343295.jpg
echo urban-day-26970225.jpg
echo urban-day-18225155.jpg
echo urban-dusk-18498516.jpg
echo urban-dusk-33619969.jpg
echo urban-dusk-14531437.jpg
echo urban-dusk-11726403.jpg
echo urban-dusk-29821958.jpg
echo urban-dusk-2325877.jpg
echo urban-night-20779987.jpg
echo urban-night-7100679.jpg
echo urban-night-9854856.jpg
echo urban-night-6635772.jpg
echo urban-night-1699588.jpg
echo urban-night-13937492.jpg
echo mono-dawn-30258558.jpg
echo mono-dawn-15970344.jpg
echo mono-dawn-5140910.jpg
echo mono-dawn-34205374.jpg
echo mono-dawn-4155278.jpg
echo mono-dawn-1687090.jpg
echo mono-day-13507175.jpg
echo mono-day-3318574.jpg
echo mono-day-16394767.jpg
echo mono-day-12811745.jpg
echo mono-day-6449057.jpg
echo mono-day-569700.jpg
echo mono-dusk-35158356.jpg
echo mono-dusk-12200746.jpg
echo mono-dusk-9752609.jpg
echo mono-dusk-15757999.jpg
echo mono-dusk-2035416.jpg
echo mono-dusk-36280005.jpg
echo mono-night-31531447.jpg
echo mono-night-39513030.jpg
echo mono-night-36933257.jpg
echo mono-night-8920672.jpg
echo mono-night-14635963.jpg
echo mono-night-31570337.jpg
echo pnw-dawn-3646375.jpg
echo pnw-dawn-20547360.jpg
echo pnw-dawn-4448845.jpg
echo pnw-dawn-15514674.jpg
echo pnw-dawn-5645458.jpg
echo pnw-dawn-37156681.jpg
echo pnw-day-5645472.jpg
echo pnw-day-39628566.jpg
echo pnw-day-33438441.jpg
echo pnw-day-34210501.jpg
echo pnw-day-33363503.jpg
echo pnw-day-2539394.jpg
echo pnw-dusk-15726118.jpg
echo pnw-dusk-1582786.jpg
echo pnw-dusk-19525714.jpg
echo pnw-dusk-4898489.jpg
echo pnw-dusk-10939635.jpg
echo pnw-dusk-34701790.jpg
echo pnw-night-7040575.jpg
echo pnw-night-20164680.jpg
echo pnw-night-7459360.jpg
echo pnw-night-14776797.jpg
echo pnw-night-30273891.jpg
echo pnw-night-432361.jpg
echo desert-dawn-30099211.jpg
echo desert-dawn-998635.jpg
echo desert-dawn-31415641.jpg
echo desert-dawn-35752257.jpg
echo desert-dawn-10803973.jpg
echo desert-dawn-4763321.jpg
echo desert-day-38738885.jpg
echo desert-day-5472518.jpg
echo desert-day-28829635.jpg
echo desert-day-18717310.jpg
echo desert-day-5504504.jpg
echo desert-day-36721973.jpg
echo desert-dusk-50b500455f.jpg
echo desert-dusk-c92d8bc115.jpg
echo desert-dusk-f7572761c5.jpg
echo desert-dusk-28638937.jpg
echo desert-dusk-30710172.jpg
echo desert-dusk-b63e5930db.jpg
echo desert-night-8357639.jpg
echo desert-night-27730390.jpg
echo desert-night-29719492.jpg
echo desert-night-33446662.jpg
echo desert-night-11032567.jpg
echo desert-night-998642.jpg
echo brutalist-dawn-12032930.jpg
echo brutalist-dawn-4590726.jpg
echo brutalist-dawn-2454686.jpg
echo brutalist-dawn-10486449.jpg
echo brutalist-dawn-35690334.jpg
echo brutalist-dawn-11210409.jpg
echo brutalist-day-2793444.jpg
echo brutalist-day-3882638.jpg
echo brutalist-day-30617082.jpg
echo brutalist-day-17330512.jpg
echo brutalist-day-19905798.jpg
echo brutalist-day-11673953.jpg
echo brutalist-day-7816752.jpg
echo brutalist-day-4328661.jpg
echo brutalist-dusk-13862332.jpg
echo brutalist-dusk-28584394.jpg
echo brutalist-dusk-11655874.jpg
echo brutalist-dusk-30604023.jpg
echo brutalist-dusk-14780198.jpg
echo brutalist-dusk-37266434.jpg
echo brutalist-night-37321931.jpg
echo brutalist-night-9218594.jpg
echo brutalist-night-1820362.jpg
echo brutalist-night-3199232.jpg
echo brutalist-night-10806196.jpg
echo brutalist-night-3612341.jpg
echo italy-dawn-13334558.jpg
echo italy-dawn-15570451.jpg
echo italy-dawn-35424336.jpg
echo italy-dawn-8465249.jpg
echo italy-dawn-19143159.jpg
echo italy-dawn-4318577.jpg
echo italy-day-17807444.jpg
echo italy-day-36804947.jpg
echo italy-day-19900429.jpg
echo italy-day-12315130.jpg
echo italy-day-6090257.jpg
echo italy-day-31386736.jpg
echo italy-day-36318898.jpg
echo italy-day-358223.jpg
echo italy-dusk-39431284.jpg
echo italy-dusk-33329103.jpg
echo italy-dusk-28273691.jpg
echo italy-dusk-37191356.jpg
echo italy-dusk-30861099.jpg
echo italy-dusk-38454404.jpg
echo italy-night-6090245.jpg
echo italy-night-4987276.jpg
echo italy-night-37114069.jpg
echo italy-night-28539465.jpg
echo italy-night-1428586.jpg
echo italy-night-4317332.jpg
echo canada-dawn-5683362.jpg
echo canada-dawn-5877702.jpg
echo canada-dawn-19552308.jpg
echo canada-dawn-33870394.jpg
echo canada-dawn-1574183.jpg
echo canada-dawn-28028982.jpg
echo canada-day-7277046.jpg
echo canada-day-33730307.jpg
echo canada-day-7054236.jpg
echo canada-day-13724338.jpg
echo canada-day-12985506.jpg
echo canada-day-33894064.jpg
echo canada-day-19120115.jpg
echo canada-day-24244130.jpg
echo canada-dusk-36185626.jpg
echo canada-dusk-34037966.jpg
echo canada-dusk-17804308.jpg
echo canada-dusk-20463880.jpg
echo canada-dusk-23414499.jpg
echo canada-dusk-32131628.jpg
echo canada-night-26646276.jpg
echo canada-night-38294871.jpg
echo canada-night-35815153.jpg
echo canada-night-8601965.jpg
echo canada-night-5673020.jpg
echo canada-night-26960786.jpg
echo autumn-dawn-30438564.jpg
echo autumn-dawn-38037931.jpg
echo autumn-dawn-10057431.jpg
echo autumn-dawn-29231575.jpg
echo autumn-dawn-29677148.jpg
echo autumn-dawn-28714652.jpg
echo autumn-day-34233922.jpg
echo autumn-day-14237904.jpg
echo autumn-day-28893931.jpg
echo autumn-day-11902799.jpg
echo autumn-day-1545347.jpg
echo autumn-day-29518950.jpg
echo autumn-day-14780108.jpg
echo autumn-day-34939189.jpg
echo autumn-dusk-32315631.jpg
echo autumn-dusk-29239911.jpg
echo autumn-dusk-10183409.jpg
echo autumn-dusk-14730101.jpg
echo autumn-dusk-34490278.jpg
echo autumn-dusk-17410310.jpg
echo autumn-night-15506959.jpg
echo autumn-night-16647489.jpg
echo autumn-night-18928472.jpg
echo autumn-night-35082977.jpg
echo autumn-night-36688912.jpg
echo autumn-night-5871553.jpg
echo gothic-dawn-37808974.jpg
echo gothic-dawn-29287029.jpg
echo gothic-dawn-30341467.jpg
echo gothic-dawn-39627092.jpg
echo gothic-dawn-11964415.jpg
echo gothic-dawn-35890555.jpg
echo gothic-day-34451609.jpg
echo gothic-day-37209457.jpg
echo gothic-day-34987593.jpg
echo gothic-day-11154888.jpg
echo gothic-day-1796720.jpg
echo gothic-day-31269492.jpg
echo gothic-day-36149236.jpg
echo gothic-day-31125296.jpg
echo gothic-dusk-5893099.jpg
echo gothic-dusk-36943996.jpg
echo gothic-dusk-5517172.jpg
echo gothic-dusk-16827639.jpg
echo gothic-dusk-35400486.jpg
echo gothic-dusk-2389262.jpg
echo gothic-night-35829613.jpg
echo gothic-night-20684079.jpg
echo gothic-night-37423357.jpg
echo gothic-night-3046347.jpg
echo gothic-night-18668994.jpg
echo gothic-night-15770539.jpg
echo redwoods-dawn-3222686.jpg
echo redwoods-dawn-1784577.jpg
echo redwoods-dawn-5895397.jpg
echo redwoods-dawn-26225674.jpg
echo redwoods-dawn-2645414.jpg
echo redwoods-dawn-2645411.jpg
echo redwoods-dawn-4096864.jpg
echo redwoods-dawn-8146976.jpg
echo redwoods-day-5586123.jpg
echo redwoods-day-8146960.jpg
echo redwoods-day-35745123.jpg
echo redwoods-day-17084701.jpg
echo redwoods-day-20733034.jpg
echo redwoods-day-31359373.jpg
echo redwoods-day-28489224.jpg
echo redwoods-day-15888983.jpg
echo redwoods-dusk-2847282.jpg
echo redwoods-dusk-33463020.jpg
echo redwoods-dusk-19877487.jpg
echo redwoods-dusk-36084801.jpg
echo redwoods-dusk-10529692.jpg
echo redwoods-dusk-8146378.jpg
echo redwoods-dusk-30989078.jpg
echo redwoods-dusk-33462970.jpg
echo redwoods-night-19090415.jpg
echo redwoods-night-5201716.jpg
echo redwoods-night-27774108.jpg
echo redwoods-night-16778094.jpg
echo redwoods-night-27774115.jpg
echo redwoods-night-1252872.jpg
echo redwoods-night-27774111.jpg
echo redwoods-night-13444721.jpg
echo lunch-6344695.jpg
echo lunch-2583495.jpg
echo lunch-28441558.jpg
echo lunch-34420128.jpg
echo cockpit-36363143.jpg
echo cockpit-1714202.jpg
echo cockpit-13564604.jpg
echo cockpit-18471414.jpg
echo cockpit-7858258.jpg
echo dawn.jpg
echo day.jpg
echo dusk.jpg
echo night.jpg
echo ridge.jpg
) > "%MANIFEST%"
call :get alps-dawn-675251 "https://images.pexels.com/photos/675251/pexels-photo-675251.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Eberhard Grossgasteiger"
call :get alps-dawn-803028 "https://images.pexels.com/photos/803028/pexels-photo-803028.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Pexels"
call :get alps-dawn-35003423 "https://images.pexels.com/photos/35003423/pexels-photo-35003423.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Alpin Visuals"
call :get alps-dawn-14503719 "https://images.pexels.com/photos/14503719/pexels-photo-14503719.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Pexels"
call :get alps-dawn-11334345 "https://images.pexels.com/photos/11334345/pexels-photo-11334345.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Pexels"
call :get alps-dawn-826827 "https://images.pexels.com/photos/826827/pexels-photo-826827.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Pexels"
call :get alps-day-940916 "https://images.pexels.com/photos/940916/pexels-photo-940916.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Tembela Bohle"
call :get alps-day-37072357 "https://images.pexels.com/photos/37072357/pexels-photo-37072357.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Pexels"
call :get alps-day-33461144 "https://images.pexels.com/photos/33461144/pexels-photo-33461144.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Pexels"
call :get alps-day-27139098 "https://images.pexels.com/photos/27139098/pexels-photo-27139098.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Pexels"
call :get alps-day-19138473 "https://images.pexels.com/photos/19138473/pexels-photo-19138473.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Pexels"
call :get alps-day-27111966 "https://images.pexels.com/photos/27111966/pexels-photo-27111966.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Pexels"
call :get alps-day-12266764 "https://images.pexels.com/photos/12266764/pexels-photo-12266764.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Pexels"
call :get alps-day-33208207 "https://images.pexels.com/photos/33208207/pexels-photo-33208207.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Pexels"
call :get alps-dusk-24552030 "https://images.pexels.com/photos/24552030/pexels-photo-24552030.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Francesco Ungaro"
call :get alps-dusk-21545525 "https://images.pexels.com/photos/21545525/pexels-photo-21545525.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Pexels"
call :get alps-dusk-28127032 "https://images.pexels.com/photos/28127032/pexels-photo-28127032.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Pexels"
call :get alps-dusk-20938373 "https://images.pexels.com/photos/20938373/pexels-photo-20938373.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Pexels"
call :get alps-dusk-18991371 "https://images.pexels.com/photos/18991371/pexels-photo-18991371.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Pexels"
call :get alps-dusk-25478720 "https://images.pexels.com/photos/25478720/pexels-photo-25478720.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Pexels"
call :get alps-night-9202295 "https://images.pexels.com/photos/9202295/pexels-photo-9202295.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Marek Piwnicki"
call :get alps-night-30972885 "https://images.pexels.com/photos/30972885/pexels-photo-30972885.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Marek Piwnicki"
call :get alps-night-31050106 "https://images.pexels.com/photos/31050106/pexels-photo-31050106.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Pexels"
call :get alps-night-28304734 "https://images.pexels.com/photos/28304734/pexels-photo-28304734.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Pexels"
call :get alps-night-20220326 "https://images.pexels.com/photos/20220326/pexels-photo-20220326.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Pexels"
call :get alps-night-30052796 "https://images.pexels.com/photos/30052796/pexels-photo-30052796.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Pexels"
call :get alps-night-36575404 "https://images.pexels.com/photos/36575404/pexels-photo-36575404.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Pexels"
call :get alps-night-35633687 "https://images.pexels.com/photos/35633687/pexels-photo-35633687.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Pexels"
call :get tropics-dawn-33099466 "https://images.pexels.com/photos/33099466/pexels-photo-33099466.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Felix Schickel"
call :get tropics-dawn-32191652 "https://images.pexels.com/photos/32191652/pexels-photo-32191652.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Ahmad Ghani"
call :get tropics-dawn-30948081 "https://images.pexels.com/photos/30948081/pexels-photo-30948081.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Agung Pandit Wiguna"
call :get tropics-dawn-2583847 "https://images.pexels.com/photos/2583847/pexels-photo-2583847.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Stijn Dijkstra"
call :get tropics-dawn-733092 "https://images.pexels.com/photos/733092/pexels-photo-733092.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "icon com"
call :get tropics-dawn-2563174 "https://images.pexels.com/photos/2563174/pexels-photo-2563174.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Quang Nguyen Vinh"
call :get tropics-dawn-2494132 "https://images.pexels.com/photos/2494132/pexels-photo-2494132.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Rommell Buenaflor"
call :get tropics-dawn-4100133 "https://images.pexels.com/photos/4100133/pexels-photo-4100133.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Vladyslav Dushenkovsky"
call :get tropics-dawn-12321837 "https://images.pexels.com/photos/12321837/pexels-photo-12321837.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Rodrigo Mutal"
call :get tropics-day-4602246 "https://images.pexels.com/photos/4602246/pexels-photo-4602246.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Jess Loiterton"
call :get tropics-day-4602243 "https://images.pexels.com/photos/4602243/pexels-photo-4602243.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Jess Loiterton"
call :get tropics-day-16671590 "https://images.pexels.com/photos/16671590/pexels-photo-16671590.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Josh Withers"
call :get tropics-day-10740706 "https://images.pexels.com/photos/10740706/pexels-photo-10740706.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Vladimir Konoplev"
call :get tropics-day-16710718 "https://images.pexels.com/photos/16710718/pexels-photo-16710718.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Sharif Ahmed"
call :get tropics-day-38370402 "https://images.pexels.com/photos/38370402/pexels-photo-38370402.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Ariel Raz"
call :get tropics-day-6559967 "https://images.pexels.com/photos/6559967/pexels-photo-6559967.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "wewe yang"
call :get tropics-day-4327832 "https://images.pexels.com/photos/4327832/pexels-photo-4327832.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Jess Loiterton"
call :get tropics-day-31421280 "https://images.pexels.com/photos/31421280/pexels-photo-31421280.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "mysurrogateband"
call :get tropics-day-8356055 "https://images.pexels.com/photos/8356055/pexels-photo-8356055.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Mikhail Nilov"
call :get tropics-day-10490906 "https://images.pexels.com/photos/10490906/pexels-photo-10490906.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Mr Pixel"
call :get tropics-dusk-34614903 "https://images.pexels.com/photos/34614903/pexels-photo-34614903.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Soly Moses"
call :get tropics-dusk-34819159 "https://images.pexels.com/photos/34819159/pexels-photo-34819159.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Tom Fisk"
call :get tropics-dusk-5728395 "https://images.pexels.com/photos/5728395/pexels-photo-5728395.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Shaylon Elmore"
call :get tropics-dusk-36593818 "https://images.pexels.com/photos/36593818/pexels-photo-36593818.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Tom Fisk"
call :get tropics-dusk-9548239 "https://images.pexels.com/photos/9548239/pexels-photo-9548239.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Rafael Cerqueira"
call :get tropics-dusk-7987859 "https://images.pexels.com/photos/7987859/pexels-photo-7987859.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Oleg Prachuk"
call :get tropics-dusk-8239960 "https://images.pexels.com/photos/8239960/pexels-photo-8239960.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Balazs Simon"
call :get tropics-dusk-2260967 "https://images.pexels.com/photos/2260967/pexels-photo-2260967.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Arthur Brognoli"
call :get tropics-dusk-9482126 "https://images.pexels.com/photos/9482126/pexels-photo-9482126.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Asad Photo Maldives"
call :get tropics-night-9482120 "https://images.pexels.com/photos/9482120/pexels-photo-9482120.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Asad Photo Maldives"
call :get tropics-night-1724417 "https://images.pexels.com/photos/1724417/pexels-photo-1724417.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Asad Photo Maldives"
call :get tropics-night-4179962 "https://images.pexels.com/photos/4179962/pexels-photo-4179962.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "John"
call :get tropics-night-1724428 "https://images.pexels.com/photos/1724428/pexels-photo-1724428.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Asad Photo Maldives"
call :get tropics-night-37240654 "https://images.pexels.com/photos/37240654/pexels-photo-37240654.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Tapas S"
call :get tropics-night-1724422 "https://images.pexels.com/photos/1724422/pexels-photo-1724422.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Asad Photo Maldives"
call :get tropics-night-29614936 "https://images.pexels.com/photos/29614936/pexels-photo-29614936.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Asad Photo Maldives"
call :get tropics-night-12387870 "https://images.pexels.com/photos/12387870/pexels-photo-12387870.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Quang Nguyen Vinh"
call :get tropics-night-8022651 "https://images.pexels.com/photos/8022651/pexels-photo-8022651.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Jobert Enamno"
call :get tropics-night-3048211 "https://images.pexels.com/photos/3048211/pexels-photo-3048211.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Tom Fisk"
call :get urban-dawn-35496265 "https://images.pexels.com/photos/35496265/pexels-photo-35496265.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Ehtesham Kazi"
call :get urban-dawn-17393436 "https://images.pexels.com/photos/17393436/pexels-photo-17393436.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Koushalya Karthikeyan"
call :get urban-dawn-11545441 "https://images.pexels.com/photos/11545441/pexels-photo-11545441.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Alfred GF"
call :get urban-dawn-18140246 "https://images.pexels.com/photos/18140246/pexels-photo-18140246.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Marcus"
call :get urban-dawn-4217092 "https://images.pexels.com/photos/4217092/pexels-photo-4217092.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Tim Durgan"
call :get urban-dawn-35984234 "https://images.pexels.com/photos/35984234/pexels-photo-35984234.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Willian Justen de Vasconcellos"
call :get urban-day-14117491 "https://images.pexels.com/photos/14117491/pexels-photo-14117491.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Jeremy O'Keeffee"
call :get urban-day-38602763 "https://images.pexels.com/photos/38602763/pexels-photo-38602763.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Mo Qian"
call :get urban-day-29123787 "https://images.pexels.com/photos/29123787/pexels-photo-29123787.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "dumitru B"
call :get urban-day-20343295 "https://images.pexels.com/photos/20343295/pexels-photo-20343295.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Thibeau Viaene"
call :get urban-day-26970225 "https://images.pexels.com/photos/26970225/pexels-photo-26970225.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "John Benedict Malong"
call :get urban-day-18225155 "https://images.pexels.com/photos/18225155/pexels-photo-18225155.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Sevi Schiegg"
call :get urban-dusk-18498516 "https://images.pexels.com/photos/18498516/pexels-photo-18498516.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Holger J. Bub"
call :get urban-dusk-33619969 "https://images.pexels.com/photos/33619969/pexels-photo-33619969.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Federico Abis"
call :get urban-dusk-14531437 "https://images.pexels.com/photos/14531437/pexels-photo-14531437.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Gabriel Almanzar"
call :get urban-dusk-11726403 "https://images.pexels.com/photos/11726403/pexels-photo-11726403.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Jacky Chiu"
call :get urban-dusk-29821958 "https://images.pexels.com/photos/29821958/pexels-photo-29821958.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "King Ho"
call :get urban-dusk-2325877 "https://images.pexels.com/photos/2325877/pexels-photo-2325877.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Alex Qian"
call :get urban-night-20779987 "https://images.pexels.com/photos/20779987/pexels-photo-20779987.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Margarita K"
call :get urban-night-7100679 "https://images.pexels.com/photos/7100679/pexels-photo-7100679.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Amber Lam"
call :get urban-night-9854856 "https://images.pexels.com/photos/9854856/pexels-photo-9854856.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Zeeshaan Shabbir"
call :get urban-night-6635772 "https://images.pexels.com/photos/6635772/pexels-photo-6635772.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "WENCHENG JIANG"
call :get urban-night-1699588 "https://images.pexels.com/photos/1699588/pexels-photo-1699588.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Mian Rizwan"
call :get urban-night-13937492 "https://images.pexels.com/photos/13937492/pexels-photo-13937492.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "David Vives"
call :get mono-dawn-30258558 "https://images.pexels.com/photos/30258558/pexels-photo-30258558.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Stephen Leonardi"
call :get mono-dawn-15970344 "https://images.pexels.com/photos/15970344/pexels-photo-15970344.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Aysegul Aytoren"
call :get mono-dawn-5140910 "https://images.pexels.com/photos/5140910/pexels-photo-5140910.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Mark von Arb"
call :get mono-dawn-34205374 "https://images.pexels.com/photos/34205374/pexels-photo-34205374.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Lloyd Alozie"
call :get mono-dawn-4155278 "https://images.pexels.com/photos/4155278/pexels-photo-4155278.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "lea bonzer"
call :get mono-dawn-1687090 "https://images.pexels.com/photos/1687090/pexels-photo-1687090.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Cameron Casey"
call :get mono-day-13507175 "https://images.pexels.com/photos/13507175/pexels-photo-13507175.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Phearak Chamrien"
call :get mono-day-3318574 "https://images.pexels.com/photos/3318574/pexels-photo-3318574.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Steve Pancrate"
call :get mono-day-16394767 "https://images.pexels.com/photos/16394767/pexels-photo-16394767.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "King Ho"
call :get mono-day-12811745 "https://images.pexels.com/photos/12811745/pexels-photo-12811745.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Aysegul Aytoren"
call :get mono-day-6449057 "https://images.pexels.com/photos/6449057/pexels-photo-6449057.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Samuel Figueroa"
call :get mono-day-569700 "https://images.pexels.com/photos/569700/pexels-photo-569700.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "SevenStorm JUHASZIMRUS"
call :get mono-dusk-35158356 "https://images.pexels.com/photos/35158356/pexels-photo-35158356.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Muharrem Alper"
call :get mono-dusk-12200746 "https://images.pexels.com/photos/12200746/pexels-photo-12200746.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Sonny Sixteen"
call :get mono-dusk-9752609 "https://images.pexels.com/photos/9752609/pexels-photo-9752609.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Sonny Sixteen"
call :get mono-dusk-15757999 "https://images.pexels.com/photos/15757999/pexels-photo-15757999.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Sonny Sixteen"
call :get mono-dusk-2035416 "https://images.pexels.com/photos/2035416/pexels-photo-2035416.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Sonny Sixteen"
call :get mono-dusk-36280005 "https://images.pexels.com/photos/36280005/pexels-photo-36280005.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Peter Dyllong"
call :get mono-night-31531447 "https://images.pexels.com/photos/31531447/pexels-photo-31531447.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Oleksiy Yeshtokyn"
call :get mono-night-39513030 "https://images.pexels.com/photos/39513030/pexels-photo-39513030.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Abinav Kareethara Sunikuttan"
call :get mono-night-36933257 "https://images.pexels.com/photos/36933257/pexels-photo-36933257.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Ehren TheBrandBuilder"
call :get mono-night-8920672 "https://images.pexels.com/photos/8920672/pexels-photo-8920672.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "JINGBO XIA"
call :get mono-night-14635963 "https://images.pexels.com/photos/14635963/pexels-photo-14635963.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Dom Sch-veg-man"
call :get mono-night-31570337 "https://images.pexels.com/photos/31570337/pexels-photo-31570337.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Ian Findley"
call :get pnw-dawn-3646375 "https://images.pexels.com/photos/3646375/pexels-photo-3646375.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Adi K"
call :get pnw-dawn-20547360 "https://images.pexels.com/photos/20547360/pexels-photo-20547360.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Alex Moliski"
call :get pnw-dawn-4448845 "https://images.pexels.com/photos/4448845/pexels-photo-4448845.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Vlada Karpovich"
call :get pnw-dawn-15514674 "https://images.pexels.com/photos/15514674/pexels-photo-15514674.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "MICHAEL MCGARRY"
call :get pnw-dawn-5645458 "https://images.pexels.com/photos/5645458/pexels-photo-5645458.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "JOHN CALLERY"
call :get pnw-dawn-37156681 "https://images.pexels.com/photos/37156681/pexels-photo-37156681.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Dawid Zawila"
call :get pnw-day-5645472 "https://images.pexels.com/photos/5645472/pexels-photo-5645472.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "JOHN CALLERY"
call :get pnw-day-39628566 "https://images.pexels.com/photos/39628566/pexels-photo-39628566.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "William Jacobs"
call :get pnw-day-33438441 "https://images.pexels.com/photos/33438441/pexels-photo-33438441.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "William Jacobs"
call :get pnw-day-34210501 "https://images.pexels.com/photos/34210501/pexels-photo-34210501.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "William Jacobs"
call :get pnw-day-33363503 "https://images.pexels.com/photos/33363503/pexels-photo-33363503.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Heather R"
call :get pnw-day-2539394 "https://images.pexels.com/photos/2539394/pexels-photo-2539394.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Sergei A"
call :get pnw-dusk-15726118 "https://images.pexels.com/photos/15726118/pexels-photo-15726118.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "MICHAEL MCGARRY"
call :get pnw-dusk-1582786 "https://images.pexels.com/photos/1582786/pexels-photo-1582786.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Eric Sanman"
call :get pnw-dusk-19525714 "https://images.pexels.com/photos/19525714/pexels-photo-19525714.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Brandon Faloona"
call :get pnw-dusk-4898489 "https://images.pexels.com/photos/4898489/pexels-photo-4898489.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Zetong Li"
call :get pnw-dusk-10939635 "https://images.pexels.com/photos/10939635/pexels-photo-10939635.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Anne McCarthy"
call :get pnw-dusk-34701790 "https://images.pexels.com/photos/34701790/pexels-photo-34701790.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "April Choitz"
call :get pnw-night-7040575 "https://images.pexels.com/photos/7040575/pexels-photo-7040575.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Jeff boyce"
call :get pnw-night-20164680 "https://images.pexels.com/photos/20164680/pexels-photo-20164680.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Nothing Ahead"
call :get pnw-night-7459360 "https://images.pexels.com/photos/7459360/pexels-photo-7459360.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Cameron Yartz"
call :get pnw-night-14776797 "https://images.pexels.com/photos/14776797/pexels-photo-14776797.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Quang Nguyen Vinh"
call :get pnw-night-30273891 "https://images.pexels.com/photos/30273891/pexels-photo-30273891.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Stephen Leonardi"
call :get pnw-night-432361 "https://images.pexels.com/photos/432361/pexels-photo-432361.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Tabitha Mort"
call :get desert-dawn-30099211 "https://images.pexels.com/photos/30099211/pexels-photo-30099211.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Fives TM"
call :get desert-dawn-998635 "https://images.pexels.com/photos/998635/pexels-photo-998635.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Francesco Ungaro"
call :get desert-dawn-31415641 "https://images.pexels.com/photos/31415641/pexels-photo-31415641.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Denys Gromov"
call :get desert-dawn-35752257 "https://images.pexels.com/photos/35752257/pexels-photo-35752257.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "El habib El aabbassi"
call :get desert-dawn-10803973 "https://images.pexels.com/photos/10803973/pexels-photo-10803973.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Mostafa Ft.shots"
call :get desert-dawn-4763321 "https://images.pexels.com/photos/4763321/pexels-photo-4763321.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Frank Odenthal"
call :get desert-day-38738885 "https://images.pexels.com/photos/38738885/pexels-photo-38738885.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Jazz Kaundal"
call :get desert-day-5472518 "https://images.pexels.com/photos/5472518/pexels-photo-5472518.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Ryutaro Tsukata"
call :get desert-day-28829635 "https://images.pexels.com/photos/28829635/pexels-photo-28829635.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "NaturEye Conservation"
call :get desert-day-18717310 "https://images.pexels.com/photos/18717310/pexels-photo-18717310.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "AXP Photography"
call :get desert-day-5504504 "https://images.pexels.com/photos/5504504/pexels-photo-5504504.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Mike van Schoonderwalt"
call :get desert-day-36721973 "https://images.pexels.com/photos/36721973/pexels-photo-36721973.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Jennifer"
call :get desert-dusk-50b500455f "https://images.unsplash.com/photo-1622489968558-9bf6f30dcb2a?w=3200&h=1800&fit=crop&q=80" "matt mr"
call :get desert-dusk-c92d8bc115 "https://images.unsplash.com/photo-1613169629286-8457b2ffad9f?w=3200&h=1800&fit=crop&q=80" "Parker Hilton"
call :get desert-dusk-f7572761c5 "https://images.unsplash.com/photo-1602859790151-845f2023bee8?w=3200&h=1800&fit=crop&q=80" "Parker Hilton"
call :get desert-dusk-28638937 "https://images.pexels.com/photos/28638937/pexels-photo-28638937.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Stephen Leonardi"
call :get desert-dusk-30710172 "https://images.pexels.com/photos/30710172/pexels-photo-30710172.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Stijn Dijkstra"
call :get desert-dusk-b63e5930db "https://images.unsplash.com/photo-1769537145747-ff380b863f49?w=3200&h=1800&fit=crop&q=80" "Mario Dominguez"
call :get desert-night-8357639 "https://images.pexels.com/photos/8357639/pexels-photo-8357639.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Sergey Pesterev"
call :get desert-night-27730390 "https://images.pexels.com/photos/27730390/pexels-photo-27730390.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Fatih Turan"
call :get desert-night-29719492 "https://images.pexels.com/photos/29719492/pexels-photo-29719492.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Marek Piwnicki"
call :get desert-night-33446662 "https://images.pexels.com/photos/33446662/pexels-photo-33446662.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Abdullah Salah"
call :get desert-night-11032567 "https://images.pexels.com/photos/11032567/pexels-photo-11032567.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Marek Piwnicki"
call :get desert-night-998642 "https://images.pexels.com/photos/998642/pexels-photo-998642.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Francesco Ungaro"
call :get brutalist-dawn-12032930 "https://images.pexels.com/photos/12032930/pexels-photo-12032930.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Sergei Skrynnik"
call :get brutalist-dawn-4590726 "https://images.pexels.com/photos/4590726/pexels-photo-4590726.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Lucas Pezeta"
call :get brutalist-dawn-2454686 "https://images.pexels.com/photos/2454686/pexels-photo-2454686.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Athena Sandrini"
call :get brutalist-dawn-10486449 "https://images.pexels.com/photos/10486449/pexels-photo-10486449.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Amina B"
call :get brutalist-dawn-35690334 "https://images.pexels.com/photos/35690334/pexels-photo-35690334.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Rino Adamo"
call :get brutalist-dawn-11210409 "https://images.pexels.com/photos/11210409/pexels-photo-11210409.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Red Nguyen"
call :get brutalist-day-2793444 "https://images.pexels.com/photos/2793444/pexels-photo-2793444.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Rick Han"
call :get brutalist-day-3882638 "https://images.pexels.com/photos/3882638/pexels-photo-3882638.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "d_odd_y"
call :get brutalist-day-30617082 "https://images.pexels.com/photos/30617082/pexels-photo-30617082.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Jan van der Wolf"
call :get brutalist-day-17330512 "https://images.pexels.com/photos/17330512/pexels-photo-17330512.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Artem Zhukov"
call :get brutalist-day-19905798 "https://images.pexels.com/photos/19905798/pexels-photo-19905798.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Gabriele Orzekauskaite"
call :get brutalist-day-11673953 "https://images.pexels.com/photos/11673953/pexels-photo-11673953.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Mathias Reding"
call :get brutalist-day-7816752 "https://images.pexels.com/photos/7816752/pexels-photo-7816752.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Eda Ayan"
call :get brutalist-day-4328661 "https://images.pexels.com/photos/4328661/pexels-photo-4328661.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Steve Pancrate"
call :get brutalist-dusk-13862332 "https://images.pexels.com/photos/13862332/pexels-photo-13862332.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Michael Pointner"
call :get brutalist-dusk-28584394 "https://images.pexels.com/photos/28584394/pexels-photo-28584394.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Helin Gezer"
call :get brutalist-dusk-11655874 "https://images.pexels.com/photos/11655874/pexels-photo-11655874.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Le ficel"
call :get brutalist-dusk-30604023 "https://images.pexels.com/photos/30604023/pexels-photo-30604023.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Mike Norris"
call :get brutalist-dusk-14780198 "https://images.pexels.com/photos/14780198/pexels-photo-14780198.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Valeriia Slobodeniuk"
call :get brutalist-dusk-37266434 "https://images.pexels.com/photos/37266434/pexels-photo-37266434.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Shantum Singh"
call :get brutalist-night-37321931 "https://images.pexels.com/photos/37321931/pexels-photo-37321931.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Vish Pix"
call :get brutalist-night-9218594 "https://images.pexels.com/photos/9218594/pexels-photo-9218594.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Erik Mclean"
call :get brutalist-night-1820362 "https://images.pexels.com/photos/1820362/pexels-photo-1820362.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Brett Sayles"
call :get brutalist-night-3199232 "https://images.pexels.com/photos/3199232/pexels-photo-3199232.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Zhanzat Mamytova"
call :get brutalist-night-10806196 "https://images.pexels.com/photos/10806196/pexels-photo-10806196.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Niklas Jeromin"
call :get brutalist-night-3612341 "https://images.pexels.com/photos/3612341/pexels-photo-3612341.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Lukas Hartmann"
call :get italy-dawn-13334558 "https://images.pexels.com/photos/13334558/pexels-photo-13334558.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Sergiu Valenas"
call :get italy-dawn-15570451 "https://images.pexels.com/photos/15570451/pexels-photo-15570451.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Mihai Vlasceanu"
call :get italy-dawn-35424336 "https://images.pexels.com/photos/35424336/pexels-photo-35424336.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Magda Ehlers"
call :get italy-dawn-8465249 "https://images.pexels.com/photos/8465249/pexels-photo-8465249.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Salvatore Monetti"
call :get italy-dawn-19143159 "https://images.pexels.com/photos/19143159/pexels-photo-19143159.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "K"
call :get italy-dawn-4318577 "https://images.pexels.com/photos/4318577/pexels-photo-4318577.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Paolo Razzauti"
call :get italy-day-17807444 "https://images.pexels.com/photos/17807444/pexels-photo-17807444.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Matteo Parisi"
call :get italy-day-36804947 "https://images.pexels.com/photos/36804947/pexels-photo-36804947.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Nade Lozance"
call :get italy-day-19900429 "https://images.pexels.com/photos/19900429/pexels-photo-19900429.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Alain Garcia"
call :get italy-day-12315130 "https://images.pexels.com/photos/12315130/pexels-photo-12315130.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Boris Ivas"
call :get italy-day-6090257 "https://images.pexels.com/photos/6090257/pexels-photo-6090257.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Alexander Starke"
call :get italy-day-31386736 "https://images.pexels.com/photos/31386736/pexels-photo-31386736.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Gotta Be Worth It"
call :get italy-day-36318898 "https://images.pexels.com/photos/36318898/pexels-photo-36318898.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Rares Cioranu"
call :get italy-day-358223 "https://images.pexels.com/photos/358223/pexels-photo-358223.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Pixabay"
call :get italy-dusk-39431284 "https://images.pexels.com/photos/39431284/pexels-photo-39431284.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Kevin Reber"
call :get italy-dusk-33329103 "https://images.pexels.com/photos/33329103/pexels-photo-33329103.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Leo Shao"
call :get italy-dusk-28273691 "https://images.pexels.com/photos/28273691/pexels-photo-28273691.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Kai Pro"
call :get italy-dusk-37191356 "https://images.pexels.com/photos/37191356/pexels-photo-37191356.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Aliguieri"
call :get italy-dusk-30861099 "https://images.pexels.com/photos/30861099/pexels-photo-30861099.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Duc Tinh Ngo"
call :get italy-dusk-38454404 "https://images.pexels.com/photos/38454404/pexels-photo-38454404.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Mihaela Claudia Puscas"
call :get italy-night-6090245 "https://images.pexels.com/photos/6090245/pexels-photo-6090245.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Alexander Starke"
call :get italy-night-4987276 "https://images.pexels.com/photos/4987276/pexels-photo-4987276.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Henry Bauer"
call :get italy-night-37114069 "https://images.pexels.com/photos/37114069/pexels-photo-37114069.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "GYGeorge"
call :get italy-night-28539465 "https://images.pexels.com/photos/28539465/pexels-photo-28539465.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Sergey Guk"
call :get italy-night-1428586 "https://images.pexels.com/photos/1428586/pexels-photo-1428586.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Narcisa Aciko"
call :get italy-night-4317332 "https://images.pexels.com/photos/4317332/pexels-photo-4317332.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Paolo Razzauti"
call :get canada-dawn-5683362 "https://images.pexels.com/photos/5683362/pexels-photo-5683362.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Tobias Waibl"
call :get canada-dawn-5877702 "https://images.pexels.com/photos/5877702/pexels-photo-5877702.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Adi K"
call :get canada-dawn-19552308 "https://images.pexels.com/photos/19552308/pexels-photo-19552308.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "David Josephson"
call :get canada-dawn-33870394 "https://images.pexels.com/photos/33870394/pexels-photo-33870394.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Brendan Chen"
call :get canada-dawn-1574183 "https://images.pexels.com/photos/1574183/pexels-photo-1574183.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "James Wheeler"
call :get canada-dawn-28028982 "https://images.pexels.com/photos/28028982/pexels-photo-28028982.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Nunzio Guerrera"
call :get canada-day-7277046 "https://images.pexels.com/photos/7277046/pexels-photo-7277046.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Rachel Claire"
call :get canada-day-33730307 "https://images.pexels.com/photos/33730307/pexels-photo-33730307.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Roman Lukyanenko"
call :get canada-day-7054236 "https://images.pexels.com/photos/7054236/pexels-photo-7054236.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Alberta Studios"
call :get canada-day-13724338 "https://images.pexels.com/photos/13724338/pexels-photo-13724338.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Zetong Li"
call :get canada-day-12985506 "https://images.pexels.com/photos/12985506/pexels-photo-12985506.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Chrissy T"
call :get canada-day-33894064 "https://images.pexels.com/photos/33894064/pexels-photo-33894064.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Andrew Patrick Photo"
call :get canada-day-19120115 "https://images.pexels.com/photos/19120115/pexels-photo-19120115.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Eddson Lens"
call :get canada-day-24244130 "https://images.pexels.com/photos/24244130/pexels-photo-24244130.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Max Vyolsen"
call :get canada-dusk-36185626 "https://images.pexels.com/photos/36185626/pexels-photo-36185626.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Nunzio Guerrera"
call :get canada-dusk-34037966 "https://images.pexels.com/photos/34037966/pexels-photo-34037966.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Sergey Guk"
call :get canada-dusk-17804308 "https://images.pexels.com/photos/17804308/pexels-photo-17804308.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Nunzio Guerrera"
call :get canada-dusk-20463880 "https://images.pexels.com/photos/20463880/pexels-photo-20463880.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Joshua Woroniecki"
call :get canada-dusk-23414499 "https://images.pexels.com/photos/23414499/pexels-photo-23414499.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Rhys Abel"
call :get canada-dusk-32131628 "https://images.pexels.com/photos/32131628/pexels-photo-32131628.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Arjay Neyra"
call :get canada-night-26646276 "https://images.pexels.com/photos/26646276/pexels-photo-26646276.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Funky Fresh Traveles"
call :get canada-night-38294871 "https://images.pexels.com/photos/38294871/pexels-photo-38294871.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Sindre Fjerdingby Korsviken"
call :get canada-night-35815153 "https://images.pexels.com/photos/35815153/pexels-photo-35815153.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Adi K"
call :get canada-night-8601965 "https://images.pexels.com/photos/8601965/pexels-photo-8601965.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Viktor Kulikov"
call :get canada-night-5673020 "https://images.pexels.com/photos/5673020/pexels-photo-5673020.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Ken Cheung"
call :get canada-night-26960786 "https://images.pexels.com/photos/26960786/pexels-photo-26960786.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Kriz Ly"
call :get autumn-dawn-30438564 "https://images.pexels.com/photos/30438564/pexels-photo-30438564.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Feyruz Aslanov"
call :get autumn-dawn-38037931 "https://images.pexels.com/photos/38037931/pexels-photo-38037931.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Karel Drozda"
call :get autumn-dawn-10057431 "https://images.pexels.com/photos/10057431/pexels-photo-10057431.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Tom Fisk"
call :get autumn-dawn-29231575 "https://images.pexels.com/photos/29231575/pexels-photo-29231575.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Christina & Peter"
call :get autumn-dawn-29677148 "https://images.pexels.com/photos/29677148/pexels-photo-29677148.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Fabrizzio Alo"
call :get autumn-dawn-28714652 "https://images.pexels.com/photos/28714652/pexels-photo-28714652.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Anton Massalov"
call :get autumn-day-34233922 "https://images.pexels.com/photos/34233922/pexels-photo-34233922.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Michael Hamments"
call :get autumn-day-14237904 "https://images.pexels.com/photos/14237904/pexels-photo-14237904.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Imad Clicks"
call :get autumn-day-28893931 "https://images.pexels.com/photos/28893931/pexels-photo-28893931.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Aslam Athanikkal"
call :get autumn-day-11902799 "https://images.pexels.com/photos/11902799/pexels-photo-11902799.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Bryan Smith"
call :get autumn-day-1545347 "https://images.pexels.com/photos/1545347/pexels-photo-1545347.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "David Bartus"
call :get autumn-day-29518950 "https://images.pexels.com/photos/29518950/pexels-photo-29518950.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Marcio Konno"
call :get autumn-day-14780108 "https://images.pexels.com/photos/14780108/pexels-photo-14780108.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Tom Fisk"
call :get autumn-day-34939189 "https://images.pexels.com/photos/34939189/pexels-photo-34939189.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Alan Wang"
call :get autumn-dusk-32315631 "https://images.pexels.com/photos/32315631/pexels-photo-32315631.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Sherry"
call :get autumn-dusk-29239911 "https://images.pexels.com/photos/29239911/pexels-photo-29239911.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Christina & Peter"
call :get autumn-dusk-10183409 "https://images.pexels.com/photos/10183409/pexels-photo-10183409.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Manuel Torres Garcia"
call :get autumn-dusk-14730101 "https://images.pexels.com/photos/14730101/pexels-photo-14730101.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Eberhard Grossgasteiger"
call :get autumn-dusk-34490278 "https://images.pexels.com/photos/34490278/pexels-photo-34490278.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Fabio Photo"
call :get autumn-dusk-17410310 "https://images.pexels.com/photos/17410310/pexels-photo-17410310.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Brian Huynh"
call :get autumn-night-15506959 "https://images.pexels.com/photos/15506959/pexels-photo-15506959.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Amel Uzunovic"
call :get autumn-night-16647489 "https://images.pexels.com/photos/16647489/pexels-photo-16647489.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Dmitry Roshchupkin"
call :get autumn-night-18928472 "https://images.pexels.com/photos/18928472/pexels-photo-18928472.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Luke Miller"
call :get autumn-night-35082977 "https://images.pexels.com/photos/35082977/pexels-photo-35082977.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "kyaw thuwai"
call :get autumn-night-36688912 "https://images.pexels.com/photos/36688912/pexels-photo-36688912.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Lam N"
call :get autumn-night-5871553 "https://images.pexels.com/photos/5871553/pexels-photo-5871553.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Andrea Bova"
call :get gothic-dawn-37808974 "https://images.pexels.com/photos/37808974/pexels-photo-37808974.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Lewis Ashton"
call :get gothic-dawn-29287029 "https://images.pexels.com/photos/29287029/pexels-photo-29287029.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Eddson Lens"
call :get gothic-dawn-30341467 "https://images.pexels.com/photos/30341467/pexels-photo-30341467.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Gul Isik"
call :get gothic-dawn-39627092 "https://images.pexels.com/photos/39627092/pexels-photo-39627092.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Bernie Andrew"
call :get gothic-dawn-11964415 "https://images.pexels.com/photos/11964415/pexels-photo-11964415.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Zekai Zhu"
call :get gothic-dawn-35890555 "https://images.pexels.com/photos/35890555/pexels-photo-35890555.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "image studio"
call :get gothic-day-34451609 "https://images.pexels.com/photos/34451609/pexels-photo-34451609.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Valentine Kulikov"
call :get gothic-day-37209457 "https://images.pexels.com/photos/37209457/pexels-photo-37209457.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Man Fong Wong"
call :get gothic-day-34987593 "https://images.pexels.com/photos/34987593/pexels-photo-34987593.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Rino Adamo"
call :get gothic-day-11154888 "https://images.pexels.com/photos/11154888/pexels-photo-11154888.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Piotr Wojnowski"
call :get gothic-day-1796720 "https://images.pexels.com/photos/1796720/pexels-photo-1796720.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Chait Goli"
call :get gothic-day-31269492 "https://images.pexels.com/photos/31269492/pexels-photo-31269492.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Michael D Beckwith"
call :get gothic-day-36149236 "https://images.pexels.com/photos/36149236/pexels-photo-36149236.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Cara Denison"
call :get gothic-day-31125296 "https://images.pexels.com/photos/31125296/pexels-photo-31125296.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Mark Stebnicki"
call :get gothic-dusk-5893099 "https://images.pexels.com/photos/5893099/pexels-photo-5893099.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Sinitta Leunen"
call :get gothic-dusk-36943996 "https://images.pexels.com/photos/36943996/pexels-photo-36943996.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Andrea Gambirasio"
call :get gothic-dusk-5517172 "https://images.pexels.com/photos/5517172/pexels-photo-5517172.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Andrej Zeman"
call :get gothic-dusk-16827639 "https://images.pexels.com/photos/16827639/pexels-photo-16827639.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Carmen Dominguez"
call :get gothic-dusk-35400486 "https://images.pexels.com/photos/35400486/pexels-photo-35400486.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Dick Scholten"
call :get gothic-dusk-2389262 "https://images.pexels.com/photos/2389262/pexels-photo-2389262.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Pierre Blache"
call :get gothic-night-35829613 "https://images.pexels.com/photos/35829613/pexels-photo-35829613.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Igor Passchier"
call :get gothic-night-20684079 "https://images.pexels.com/photos/20684079/pexels-photo-20684079.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Clement Proust"
call :get gothic-night-37423357 "https://images.pexels.com/photos/37423357/pexels-photo-37423357.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Michael D Beckwith"
call :get gothic-night-3046347 "https://images.pexels.com/photos/3046347/pexels-photo-3046347.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Pierre Blache"
call :get gothic-night-18668994 "https://images.pexels.com/photos/18668994/pexels-photo-18668994.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Line Knipst"
call :get gothic-night-15770539 "https://images.pexels.com/photos/15770539/pexels-photo-15770539.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Hoang Vu"
call :get redwoods-dawn-3222686 "https://images.pexels.com/photos/3222686/pexels-photo-3222686.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Tim Mossholder"
call :get redwoods-dawn-1784577 "https://images.pexels.com/photos/1784577/pexels-photo-1784577.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Zetong Li"
call :get redwoods-dawn-5895397 "https://images.pexels.com/photos/5895397/pexels-photo-5895397.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Erik Mclean"
call :get redwoods-dawn-26225674 "https://images.pexels.com/photos/26225674/pexels-photo-26225674.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Peter B"
call :get redwoods-dawn-2645414 "https://images.pexels.com/photos/2645414/pexels-photo-2645414.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Mike Krejci"
call :get redwoods-dawn-2645411 "https://images.pexels.com/photos/2645411/pexels-photo-2645411.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Mike Krejci"
call :get redwoods-dawn-4096864 "https://images.pexels.com/photos/4096864/pexels-photo-4096864.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Johannes Plenio"
call :get redwoods-dawn-8146976 "https://images.pexels.com/photos/8146976/pexels-photo-8146976.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "ArtHouse Studio"
call :get redwoods-day-5586123 "https://images.pexels.com/photos/5586123/pexels-photo-5586123.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Mick Haupt"
call :get redwoods-day-8146960 "https://images.pexels.com/photos/8146960/pexels-photo-8146960.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "ArtHouse Studio"
call :get redwoods-day-35745123 "https://images.pexels.com/photos/35745123/pexels-photo-35745123.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Frances W"
call :get redwoods-day-17084701 "https://images.pexels.com/photos/17084701/pexels-photo-17084701.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Josh Hild"
call :get redwoods-day-20733034 "https://images.pexels.com/photos/20733034/pexels-photo-20733034.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Umay Isik"
call :get redwoods-day-31359373 "https://images.pexels.com/photos/31359373/pexels-photo-31359373.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "John Hanson"
call :get redwoods-day-28489224 "https://images.pexels.com/photos/28489224/pexels-photo-28489224.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Sergey Guk"
call :get redwoods-day-15888983 "https://images.pexels.com/photos/15888983/pexels-photo-15888983.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Airam Dato-on"
call :get redwoods-dusk-2847282 "https://images.pexels.com/photos/2847282/pexels-photo-2847282.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Ray Z"
call :get redwoods-dusk-33463020 "https://images.pexels.com/photos/33463020/pexels-photo-33463020.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Katie Mukhina"
call :get redwoods-dusk-19877487 "https://images.pexels.com/photos/19877487/pexels-photo-19877487.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Joshua Woroniecki"
call :get redwoods-dusk-36084801 "https://images.pexels.com/photos/36084801/pexels-photo-36084801.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "James Wilson"
call :get redwoods-dusk-10529692 "https://images.pexels.com/photos/10529692/pexels-photo-10529692.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Ted McDonnell"
call :get redwoods-dusk-8146378 "https://images.pexels.com/photos/8146378/pexels-photo-8146378.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "ArtHouse Studio"
call :get redwoods-dusk-30989078 "https://images.pexels.com/photos/30989078/pexels-photo-30989078.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Naveen Ketterer"
call :get redwoods-dusk-33462970 "https://images.pexels.com/photos/33462970/pexels-photo-33462970.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Katie Mukhina"
call :get redwoods-night-19090415 "https://images.pexels.com/photos/19090415/pexels-photo-19090415.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Ramaz Bluashvili"
call :get redwoods-night-5201716 "https://images.pexels.com/photos/5201716/pexels-photo-5201716.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Mick Haupt"
call :get redwoods-night-27774108 "https://images.pexels.com/photos/27774108/pexels-photo-27774108.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Troy Olson"
call :get redwoods-night-16778094 "https://images.pexels.com/photos/16778094/pexels-photo-16778094.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Aliaksei Lepik"
call :get redwoods-night-27774115 "https://images.pexels.com/photos/27774115/pexels-photo-27774115.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Troy Olson"
call :get redwoods-night-1252872 "https://images.pexels.com/photos/1252872/pexels-photo-1252872.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Hristo Fidanov"
call :get redwoods-night-27774111 "https://images.pexels.com/photos/27774111/pexels-photo-27774111.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Troy Olson"
call :get redwoods-night-13444721 "https://images.pexels.com/photos/13444721/pexels-photo-13444721.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Nicolas Outin"
call :get lunch-6344695 "https://images.pexels.com/photos/6344695/pexels-photo-6344695.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Christian Buergi"
call :get lunch-2583495 "https://images.pexels.com/photos/2583495/pexels-photo-2583495.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Guillaume Hankenne"
call :get lunch-28441558 "https://images.pexels.com/photos/28441558/pexels-photo-28441558.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "K"
call :get lunch-34420128 "https://images.pexels.com/photos/34420128/pexels-photo-34420128.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Patrik Fassler"
call :get cockpit-36363143 "https://images.pexels.com/photos/36363143/pexels-photo-36363143.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Josh Sorenson"
call :get cockpit-1714202 "https://images.pexels.com/photos/1714202/pexels-photo-1714202.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Josh Sorenson"
call :get cockpit-13564604 "https://images.pexels.com/photos/13564604/pexels-photo-13564604.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Pramod Tiwari"
call :get cockpit-18471414 "https://images.pexels.com/photos/18471414/pexels-photo-18471414.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "Ludovic Delot"
call :get cockpit-7858258 "https://images.pexels.com/photos/7858258/pexels-photo-7858258.jpeg?auto=compress&cs=tinysrgb&w=3200&h=1800&fit=crop" "cottonbro studio"
echo.
echo   Removing pictures that left the library...
for %%f in (*.jpg) do ( findstr /x /i /c:"%%f" "%MANIFEST%" >nul || ( echo   - %%f & del "%%f" ) )
del "%MANIFEST%" >nul 2>&1
echo.
echo   Done. Restart Bench. to see them.
if /i not "%~1"=="nopause" pause
exit /b 0

:get
if exist "%~1.jpg" ( exit /b 0 )
echo   %~1  ^<- %~3
curl -sL -o "%~1.jpg" "%~2"
if errorlevel 1 echo      FAILED for %~1
exit /b 0
