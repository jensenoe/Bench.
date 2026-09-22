@echo off
setlocal
cd /d "%~dp0public\terrain"
title Fetch photographs
echo.
echo   Fetching 302 photographs (Pexels and Unsplash, free licences).
echo   Eleven libraries from the Alps to Edinburgh, plus Lunch and Cockpit covers.
echo   Existing files are skipped, so rerunning is cheap. Pictures no longer in the
echo   library are removed at the end.
echo.
where curl >nul 2>&1
if errorlevel 1 ( echo   curl.exe not found. It ships with Windows 10 1803 and later. & pause & exit /b 1 )
set MANIFEST=%TEMP%\bench-photos.txt
(
echo alps-dawn-675251.jpg
echo alps-dawn-803028.jpg
echo alps-dawn-18449747.jpg
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
echo alps-night-572897.jpg
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
echo tropics-dawn-37526751.jpg
echo tropics-dawn-10197860.jpg
echo tropics-dawn-5769326.jpg
echo tropics-dawn-4100133.jpg
echo tropics-dawn-12321837.jpg
echo tropics-day-4602246.jpg
echo tropics-day-4602243.jpg
echo tropics-day-16671590.jpg
echo tropics-day-10740706.jpg
echo tropics-day-29781197.jpg
echo tropics-day-17619301.jpg
echo tropics-day-36574629.jpg
echo tropics-day-4327832.jpg
echo tropics-day-31421280.jpg
echo tropics-day-8356055.jpg
echo tropics-day-34939160.jpg
echo tropics-dusk-34614903.jpg
echo tropics-dusk-34819159.jpg
echo tropics-dusk-5728395.jpg
echo tropics-dusk-36593818.jpg
echo tropics-dusk-29028155.jpg
echo tropics-dusk-7987859.jpg
echo tropics-dusk-8239960.jpg
echo tropics-dusk-2260967.jpg
echo tropics-dusk-9482126.jpg
echo tropics-night-7051519.jpg
echo tropics-night-29119172.jpg
echo tropics-night-4179962.jpg
echo tropics-night-9411736.jpg
echo tropics-night-19983070.jpg
echo tropics-night-17892742.jpg
echo tropics-night-2903307.jpg
echo tropics-night-31671593.jpg
echo tropics-night-8022651.jpg
echo tropics-night-9546531.jpg
echo urban-dawn-35496265.jpg
echo urban-dawn-17393436.jpg
echo urban-dawn-11545441.jpg
echo urban-dawn-18140246.jpg
echo urban-dawn-4217092.jpg
echo urban-dawn-35984234.jpg
echo urban-day-28279109.jpg
echo urban-day-15327183.jpg
echo urban-day-5847764.jpg
echo urban-day-17185171.jpg
echo urban-day-26970225.jpg
echo urban-day-18225155.jpg
echo urban-dusk-24589249.jpg
echo urban-dusk-33619969.jpg
echo urban-dusk-14531437.jpg
echo urban-dusk-11726403.jpg
echo urban-dusk-29821958.jpg
echo urban-dusk-2325877.jpg
echo urban-night-20779987.jpg
echo urban-night-7100679.jpg
echo urban-night-9854856.jpg
echo urban-night-11290329.jpg
echo urban-night-1699588.jpg
echo urban-night-13937492.jpg
echo mono-dawn-30258558.jpg
echo mono-dawn-20582951.jpg
echo mono-dawn-5140910.jpg
echo mono-dawn-20506163.jpg
echo mono-dawn-12162506.jpg
echo mono-dawn-1687090.jpg
echo mono-day-13507175.jpg
echo mono-day-3318574.jpg
echo mono-day-10991758.jpg
echo mono-day-12811745.jpg
echo mono-day-6449057.jpg
echo mono-day-1937628.jpg
echo mono-dusk-35158356.jpg
echo mono-dusk-12200746.jpg
echo mono-dusk-9752609.jpg
echo mono-dusk-15757999.jpg
echo mono-dusk-2035416.jpg
echo mono-dusk-36280005.jpg
echo mono-night-35847122.jpg
echo mono-night-39513030.jpg
echo mono-night-36933257.jpg
echo mono-night-30450018.jpg
echo mono-night-19718502.jpg
echo mono-night-31570337.jpg
echo pnw-dawn-32093988.jpg
echo pnw-dawn-7844770.jpg
echo pnw-dawn-27961888.jpg
echo pnw-dawn-5470671.jpg
echo pnw-dawn-13214127.jpg
echo pnw-dawn-37156681.jpg
echo pnw-day-38274783.jpg
echo pnw-day-28615092.jpg
echo pnw-day-34492829.jpg
echo pnw-day-34175305.jpg
echo pnw-day-6363037.jpg
echo pnw-day-34004181.jpg
echo pnw-dusk-21905877.jpg
echo pnw-dusk-13240965.jpg
echo pnw-dusk-9996457.jpg
echo pnw-dusk-19198782.jpg
echo pnw-dusk-2067640.jpg
echo pnw-dusk-34701790.jpg
echo pnw-night-18581833.jpg
echo pnw-night-20164680.jpg
echo pnw-night-7459360.jpg
echo pnw-night-14776797.jpg
echo pnw-night-9562188.jpg
echo pnw-night-29343549.jpg
echo desert-dawn-30099211.jpg
echo desert-dawn-998635.jpg
echo desert-dawn-31415641.jpg
echo desert-dawn-35752257.jpg
echo desert-dawn-10803973.jpg
echo desert-dawn-3974145.jpg
echo desert-day-38738885.jpg
echo desert-day-5472518.jpg
echo desert-day-412050.jpg
echo desert-day-13811651.jpg
echo desert-day-5504504.jpg
echo desert-day-10551201.jpg
echo desert-dusk-50b500455f.jpg
echo desert-dusk-c92d8bc115.jpg
echo desert-dusk-f7572761c5.jpg
echo desert-dusk-28638937.jpg
echo desert-dusk-30710172.jpg
echo desert-dusk-b63e5930db.jpg
echo desert-night-8357639.jpg
echo desert-night-35548672.jpg
echo desert-night-19154726.jpg
echo desert-night-33446662.jpg
echo desert-night-11032567.jpg
echo desert-night-998642.jpg
echo brutalist-dawn-19955859.jpg
echo brutalist-dawn-22814306.jpg
echo brutalist-dawn-6516097.jpg
echo brutalist-dawn-10486449.jpg
echo brutalist-dawn-33422507.jpg
echo brutalist-dawn-38644713.jpg
echo brutalist-day-2793444.jpg
echo brutalist-day-3882638.jpg
echo brutalist-day-30617082.jpg
echo brutalist-day-17330512.jpg
echo brutalist-day-19905798.jpg
echo brutalist-day-11673953.jpg
echo brutalist-day-1337285.jpg
echo brutalist-day-26741547.jpg
echo brutalist-dusk-13862332.jpg
echo brutalist-dusk-28584394.jpg
echo brutalist-dusk-11655874.jpg
echo brutalist-dusk-30604023.jpg
echo brutalist-dusk-14780198.jpg
echo brutalist-dusk-37266434.jpg
echo brutalist-night-33943173.jpg
echo brutalist-night-10349473.jpg
echo brutalist-night-1820362.jpg
echo brutalist-night-3199232.jpg
echo brutalist-night-10806196.jpg
echo brutalist-night-3612341.jpg
echo italy-dawn-13334558.jpg
echo italy-dawn-15570451.jpg
echo italy-dawn-35424336.jpg
echo italy-dawn-12464304.jpg
echo italy-dawn-26976206.jpg
echo italy-dawn-30222761.jpg
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
echo canada-dawn-6272229.jpg
echo canada-dawn-28811917.jpg
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
echo canada-dusk-12905874.jpg
echo canada-dusk-5754973.jpg
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
echo autumn-dawn-34408242.jpg
echo autumn-dawn-29231575.jpg
echo autumn-dawn-29677148.jpg
echo autumn-dawn-5837855.jpg
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
echo autumn-night-11850828.jpg
echo autumn-night-8631540.jpg
echo autumn-night-5871553.jpg
echo gothic-dawn-37808974.jpg
echo gothic-dawn-17364095.jpg
echo gothic-dawn-30341467.jpg
echo gothic-dawn-39627092.jpg
echo gothic-dawn-11964415.jpg
echo gothic-dawn-19964011.jpg
echo gothic-day-34451609.jpg
echo gothic-day-28683783.jpg
echo gothic-day-28120765.jpg
echo gothic-day-11154888.jpg
echo gothic-day-1796720.jpg
echo gothic-day-31269492.jpg
echo gothic-day-12233830.jpg
echo gothic-day-12787468.jpg
echo gothic-dusk-5893099.jpg
echo gothic-dusk-28586330.jpg
echo gothic-dusk-5517172.jpg
echo gothic-dusk-16827639.jpg
echo gothic-dusk-35400486.jpg
echo gothic-dusk-11827684.jpg
echo gothic-night-35829613.jpg
echo gothic-night-20684079.jpg
echo gothic-night-37423357.jpg
echo gothic-night-36631587.jpg
echo gothic-night-18668994.jpg
echo gothic-night-15770539.jpg
echo lunch-6344695.jpg
echo lunch-2583495.jpg
echo lunch-28441558.jpg
echo lunch-6338424.jpg
echo cockpit-36363143.jpg
echo cockpit-1714202.jpg
echo cockpit-4374464.jpg
echo cockpit-18471414.jpg
echo cockpit-7858258.jpg
echo dawn.jpg
echo day.jpg
echo dusk.jpg
echo night.jpg
echo ridge.jpg
) > "%MANIFEST%"
call :get alps-dawn-675251 "https://images.pexels.com/photos/675251/pexels-photo-675251.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Eberhard Grossgasteiger"
call :get alps-dawn-803028 "https://images.pexels.com/photos/803028/pexels-photo-803028.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Pexels"
call :get alps-dawn-18449747 "https://images.pexels.com/photos/18449747/pexels-photo-18449747.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Pexels"
call :get alps-dawn-14503719 "https://images.pexels.com/photos/14503719/pexels-photo-14503719.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Pexels"
call :get alps-dawn-11334345 "https://images.pexels.com/photos/11334345/pexels-photo-11334345.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Pexels"
call :get alps-dawn-826827 "https://images.pexels.com/photos/826827/pexels-photo-826827.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Pexels"
call :get alps-day-940916 "https://images.pexels.com/photos/940916/pexels-photo-940916.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Tembela Bohle"
call :get alps-day-37072357 "https://images.pexels.com/photos/37072357/pexels-photo-37072357.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Pexels"
call :get alps-day-33461144 "https://images.pexels.com/photos/33461144/pexels-photo-33461144.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Pexels"
call :get alps-day-27139098 "https://images.pexels.com/photos/27139098/pexels-photo-27139098.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Pexels"
call :get alps-day-19138473 "https://images.pexels.com/photos/19138473/pexels-photo-19138473.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Pexels"
call :get alps-day-27111966 "https://images.pexels.com/photos/27111966/pexels-photo-27111966.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Pexels"
call :get alps-day-12266764 "https://images.pexels.com/photos/12266764/pexels-photo-12266764.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Pexels"
call :get alps-day-33208207 "https://images.pexels.com/photos/33208207/pexels-photo-33208207.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Pexels"
call :get alps-dusk-24552030 "https://images.pexels.com/photos/24552030/pexels-photo-24552030.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Francesco Ungaro"
call :get alps-dusk-21545525 "https://images.pexels.com/photos/21545525/pexels-photo-21545525.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Pexels"
call :get alps-dusk-28127032 "https://images.pexels.com/photos/28127032/pexels-photo-28127032.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Pexels"
call :get alps-dusk-20938373 "https://images.pexels.com/photos/20938373/pexels-photo-20938373.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Pexels"
call :get alps-dusk-18991371 "https://images.pexels.com/photos/18991371/pexels-photo-18991371.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Pexels"
call :get alps-dusk-25478720 "https://images.pexels.com/photos/25478720/pexels-photo-25478720.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Pexels"
call :get alps-night-9202295 "https://images.pexels.com/photos/9202295/pexels-photo-9202295.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Marek Piwnicki"
call :get alps-night-572897 "https://images.pexels.com/photos/572897/pexels-photo-572897.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Pexels"
call :get alps-night-31050106 "https://images.pexels.com/photos/31050106/pexels-photo-31050106.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Pexels"
call :get alps-night-28304734 "https://images.pexels.com/photos/28304734/pexels-photo-28304734.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Pexels"
call :get alps-night-20220326 "https://images.pexels.com/photos/20220326/pexels-photo-20220326.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Pexels"
call :get alps-night-30052796 "https://images.pexels.com/photos/30052796/pexels-photo-30052796.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Pexels"
call :get alps-night-36575404 "https://images.pexels.com/photos/36575404/pexels-photo-36575404.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Pexels"
call :get alps-night-35633687 "https://images.pexels.com/photos/35633687/pexels-photo-35633687.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Pexels"
call :get tropics-dawn-33099466 "https://images.pexels.com/photos/33099466/pexels-photo-33099466.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Felix Schickel"
call :get tropics-dawn-32191652 "https://images.pexels.com/photos/32191652/pexels-photo-32191652.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Ahmad Ghani"
call :get tropics-dawn-30948081 "https://images.pexels.com/photos/30948081/pexels-photo-30948081.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Agung Pandit Wiguna"
call :get tropics-dawn-2583847 "https://images.pexels.com/photos/2583847/pexels-photo-2583847.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Stijn Dijkstra"
call :get tropics-dawn-37526751 "https://images.pexels.com/photos/37526751/pexels-photo-37526751.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "wahyuy"
call :get tropics-dawn-10197860 "https://images.pexels.com/photos/10197860/pexels-photo-10197860.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Alexey Demidov"
call :get tropics-dawn-5769326 "https://images.pexels.com/photos/5769326/pexels-photo-5769326.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Julia Volk"
call :get tropics-dawn-4100133 "https://images.pexels.com/photos/4100133/pexels-photo-4100133.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Vladyslav Dushenkovsky"
call :get tropics-dawn-12321837 "https://images.pexels.com/photos/12321837/pexels-photo-12321837.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Rodrigo Mutal"
call :get tropics-day-4602246 "https://images.pexels.com/photos/4602246/pexels-photo-4602246.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Jess Loiterton"
call :get tropics-day-4602243 "https://images.pexels.com/photos/4602243/pexels-photo-4602243.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Jess Loiterton"
call :get tropics-day-16671590 "https://images.pexels.com/photos/16671590/pexels-photo-16671590.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Josh Withers"
call :get tropics-day-10740706 "https://images.pexels.com/photos/10740706/pexels-photo-10740706.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Vladimir Konoplev"
call :get tropics-day-29781197 "https://images.pexels.com/photos/29781197/pexels-photo-29781197.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Spha Ntshangase"
call :get tropics-day-17619301 "https://images.pexels.com/photos/17619301/pexels-photo-17619301.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Dani Randall"
call :get tropics-day-36574629 "https://images.pexels.com/photos/36574629/pexels-photo-36574629.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Will Chen"
call :get tropics-day-4327832 "https://images.pexels.com/photos/4327832/pexels-photo-4327832.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Jess Loiterton"
call :get tropics-day-31421280 "https://images.pexels.com/photos/31421280/pexels-photo-31421280.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "mysurrogateband"
call :get tropics-day-8356055 "https://images.pexels.com/photos/8356055/pexels-photo-8356055.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Mikhail Nilov"
call :get tropics-day-34939160 "https://images.pexels.com/photos/34939160/pexels-photo-34939160.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Sarah Vivian"
call :get tropics-dusk-34614903 "https://images.pexels.com/photos/34614903/pexels-photo-34614903.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Soly Moses"
call :get tropics-dusk-34819159 "https://images.pexels.com/photos/34819159/pexels-photo-34819159.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Tom Fisk"
call :get tropics-dusk-5728395 "https://images.pexels.com/photos/5728395/pexels-photo-5728395.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Shaylon Elmore"
call :get tropics-dusk-36593818 "https://images.pexels.com/photos/36593818/pexels-photo-36593818.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Tom Fisk"
call :get tropics-dusk-29028155 "https://images.pexels.com/photos/29028155/pexels-photo-29028155.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Pexels"
call :get tropics-dusk-7987859 "https://images.pexels.com/photos/7987859/pexels-photo-7987859.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Oleg Prachuk"
call :get tropics-dusk-8239960 "https://images.pexels.com/photos/8239960/pexels-photo-8239960.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Balazs Simon"
call :get tropics-dusk-2260967 "https://images.pexels.com/photos/2260967/pexels-photo-2260967.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Arthur Brognoli"
call :get tropics-dusk-9482126 "https://images.pexels.com/photos/9482126/pexels-photo-9482126.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Asad Photo Maldives"
call :get tropics-night-7051519 "https://images.pexels.com/photos/7051519/pexels-photo-7051519.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Jose Luis"
call :get tropics-night-29119172 "https://images.pexels.com/photos/29119172/pexels-photo-29119172.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "bynamnamnam"
call :get tropics-night-4179962 "https://images.pexels.com/photos/4179962/pexels-photo-4179962.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "John"
call :get tropics-night-9411736 "https://images.pexels.com/photos/9411736/pexels-photo-9411736.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Sharath Giri"
call :get tropics-night-19983070 "https://images.pexels.com/photos/19983070/pexels-photo-19983070.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Lesandu Alokabandara"
call :get tropics-night-17892742 "https://images.pexels.com/photos/17892742/pexels-photo-17892742.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Andre Moura"
call :get tropics-night-2903307 "https://images.pexels.com/photos/2903307/pexels-photo-2903307.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Ali Hassan"
call :get tropics-night-31671593 "https://images.pexels.com/photos/31671593/pexels-photo-31671593.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Daniel's Richard"
call :get tropics-night-8022651 "https://images.pexels.com/photos/8022651/pexels-photo-8022651.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Jobert Enamno"
call :get tropics-night-9546531 "https://images.pexels.com/photos/9546531/pexels-photo-9546531.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Luz Calor Som"
call :get urban-dawn-35496265 "https://images.pexels.com/photos/35496265/pexels-photo-35496265.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Ehtesham Kazi"
call :get urban-dawn-17393436 "https://images.pexels.com/photos/17393436/pexels-photo-17393436.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Koushalya Karthikeyan"
call :get urban-dawn-11545441 "https://images.pexels.com/photos/11545441/pexels-photo-11545441.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Alfred GF"
call :get urban-dawn-18140246 "https://images.pexels.com/photos/18140246/pexels-photo-18140246.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Marcus"
call :get urban-dawn-4217092 "https://images.pexels.com/photos/4217092/pexels-photo-4217092.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Tim Durgan"
call :get urban-dawn-35984234 "https://images.pexels.com/photos/35984234/pexels-photo-35984234.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Willian Justen de Vasconcellos"
call :get urban-day-28279109 "https://images.pexels.com/photos/28279109/pexels-photo-28279109.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Chengxiang LIAO"
call :get urban-day-15327183 "https://images.pexels.com/photos/15327183/pexels-photo-15327183.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Yura Forrat"
call :get urban-day-5847764 "https://images.pexels.com/photos/5847764/pexels-photo-5847764.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Charles Parker"
call :get urban-day-17185171 "https://images.pexels.com/photos/17185171/pexels-photo-17185171.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Zx Teoh"
call :get urban-day-26970225 "https://images.pexels.com/photos/26970225/pexels-photo-26970225.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "John Benedict Malong"
call :get urban-day-18225155 "https://images.pexels.com/photos/18225155/pexels-photo-18225155.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Sevi Schiegg"
call :get urban-dusk-24589249 "https://images.pexels.com/photos/24589249/pexels-photo-24589249.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Luke Miller"
call :get urban-dusk-33619969 "https://images.pexels.com/photos/33619969/pexels-photo-33619969.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Federico Abis"
call :get urban-dusk-14531437 "https://images.pexels.com/photos/14531437/pexels-photo-14531437.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Gabriel Almanzar"
call :get urban-dusk-11726403 "https://images.pexels.com/photos/11726403/pexels-photo-11726403.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Jacky Chiu"
call :get urban-dusk-29821958 "https://images.pexels.com/photos/29821958/pexels-photo-29821958.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "King Ho"
call :get urban-dusk-2325877 "https://images.pexels.com/photos/2325877/pexels-photo-2325877.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Alex Qian"
call :get urban-night-20779987 "https://images.pexels.com/photos/20779987/pexels-photo-20779987.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Margarita K"
call :get urban-night-7100679 "https://images.pexels.com/photos/7100679/pexels-photo-7100679.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Amber Lam"
call :get urban-night-9854856 "https://images.pexels.com/photos/9854856/pexels-photo-9854856.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Zeeshaan Shabbir"
call :get urban-night-11290329 "https://images.pexels.com/photos/11290329/pexels-photo-11290329.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Mahmoud Nawawy"
call :get urban-night-1699588 "https://images.pexels.com/photos/1699588/pexels-photo-1699588.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Mian Rizwan"
call :get urban-night-13937492 "https://images.pexels.com/photos/13937492/pexels-photo-13937492.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "David Vives"
call :get mono-dawn-30258558 "https://images.pexels.com/photos/30258558/pexels-photo-30258558.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Stephen Leonardi"
call :get mono-dawn-20582951 "https://images.pexels.com/photos/20582951/pexels-photo-20582951.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Janos Csatlos"
call :get mono-dawn-5140910 "https://images.pexels.com/photos/5140910/pexels-photo-5140910.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Mark von Arb"
call :get mono-dawn-20506163 "https://images.pexels.com/photos/20506163/pexels-photo-20506163.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Narmin Aslanli"
call :get mono-dawn-12162506 "https://images.pexels.com/photos/12162506/pexels-photo-12162506.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Scott Foltz"
call :get mono-dawn-1687090 "https://images.pexels.com/photos/1687090/pexels-photo-1687090.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Cameron Casey"
call :get mono-day-13507175 "https://images.pexels.com/photos/13507175/pexels-photo-13507175.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Phearak Chamrien"
call :get mono-day-3318574 "https://images.pexels.com/photos/3318574/pexels-photo-3318574.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Steve Pancrate"
call :get mono-day-10991758 "https://images.pexels.com/photos/10991758/pexels-photo-10991758.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Emmanuel Hernandez"
call :get mono-day-12811745 "https://images.pexels.com/photos/12811745/pexels-photo-12811745.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Aysegul Aytoren"
call :get mono-day-6449057 "https://images.pexels.com/photos/6449057/pexels-photo-6449057.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Samuel Figueroa"
call :get mono-day-1937628 "https://images.pexels.com/photos/1937628/pexels-photo-1937628.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Ivan Rivero"
call :get mono-dusk-35158356 "https://images.pexels.com/photos/35158356/pexels-photo-35158356.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Muharrem Alper"
call :get mono-dusk-12200746 "https://images.pexels.com/photos/12200746/pexels-photo-12200746.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Sonny Sixteen"
call :get mono-dusk-9752609 "https://images.pexels.com/photos/9752609/pexels-photo-9752609.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Sonny Sixteen"
call :get mono-dusk-15757999 "https://images.pexels.com/photos/15757999/pexels-photo-15757999.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Sonny Sixteen"
call :get mono-dusk-2035416 "https://images.pexels.com/photos/2035416/pexels-photo-2035416.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Sonny Sixteen"
call :get mono-dusk-36280005 "https://images.pexels.com/photos/36280005/pexels-photo-36280005.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Peter Dyllong"
call :get mono-night-35847122 "https://images.pexels.com/photos/35847122/pexels-photo-35847122.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Ivan Baton"
call :get mono-night-39513030 "https://images.pexels.com/photos/39513030/pexels-photo-39513030.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Abinav Kareethara Sunikuttan"
call :get mono-night-36933257 "https://images.pexels.com/photos/36933257/pexels-photo-36933257.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Ehren TheBrandBuilder"
call :get mono-night-30450018 "https://images.pexels.com/photos/30450018/pexels-photo-30450018.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "John Wayne"
call :get mono-night-19718502 "https://images.pexels.com/photos/19718502/pexels-photo-19718502.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Saad Nadeem"
call :get mono-night-31570337 "https://images.pexels.com/photos/31570337/pexels-photo-31570337.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Ian Findley"
call :get pnw-dawn-32093988 "https://images.pexels.com/photos/32093988/pexels-photo-32093988.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Tom Fisk"
call :get pnw-dawn-7844770 "https://images.pexels.com/photos/7844770/pexels-photo-7844770.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Cheryl Prince"
call :get pnw-dawn-27961888 "https://images.pexels.com/photos/27961888/pexels-photo-27961888.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Damien Dufour"
call :get pnw-dawn-5470671 "https://images.pexels.com/photos/5470671/pexels-photo-5470671.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Raka Miftah"
call :get pnw-dawn-13214127 "https://images.pexels.com/photos/13214127/pexels-photo-13214127.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Diana"
call :get pnw-dawn-37156681 "https://images.pexels.com/photos/37156681/pexels-photo-37156681.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Dawid Zawila"
call :get pnw-day-38274783 "https://images.pexels.com/photos/38274783/pexels-photo-38274783.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Mazin Omron"
call :get pnw-day-28615092 "https://images.pexels.com/photos/28615092/pexels-photo-28615092.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Stephen Leonardi"
call :get pnw-day-34492829 "https://images.pexels.com/photos/34492829/pexels-photo-34492829.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Griffin Wooldridge"
call :get pnw-day-34175305 "https://images.pexels.com/photos/34175305/pexels-photo-34175305.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Marcelo Gonzalez"
call :get pnw-day-6363037 "https://images.pexels.com/photos/6363037/pexels-photo-6363037.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Mario Cuadros"
call :get pnw-day-34004181 "https://images.pexels.com/photos/34004181/pexels-photo-34004181.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Omer Gungor"
call :get pnw-dusk-21905877 "https://images.pexels.com/photos/21905877/pexels-photo-21905877.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "The Design Lady"
call :get pnw-dusk-13240965 "https://images.pexels.com/photos/13240965/pexels-photo-13240965.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Abdulrahman Mobaraki"
call :get pnw-dusk-9996457 "https://images.pexels.com/photos/9996457/pexels-photo-9996457.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "RENDAN CATIPAY"
call :get pnw-dusk-19198782 "https://images.pexels.com/photos/19198782/pexels-photo-19198782.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Matthias Polen"
call :get pnw-dusk-2067640 "https://images.pexels.com/photos/2067640/pexels-photo-2067640.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Marta Dzedyshko"
call :get pnw-dusk-34701790 "https://images.pexels.com/photos/34701790/pexels-photo-34701790.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "April Choitz"
call :get pnw-night-18581833 "https://images.pexels.com/photos/18581833/pexels-photo-18581833.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Abdulvahap Demir"
call :get pnw-night-20164680 "https://images.pexels.com/photos/20164680/pexels-photo-20164680.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Nothing Ahead"
call :get pnw-night-7459360 "https://images.pexels.com/photos/7459360/pexels-photo-7459360.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Cameron Yartz"
call :get pnw-night-14776797 "https://images.pexels.com/photos/14776797/pexels-photo-14776797.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Quang Nguyen Vinh"
call :get pnw-night-9562188 "https://images.pexels.com/photos/9562188/pexels-photo-9562188.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Aleksey Vecherin"
call :get pnw-night-29343549 "https://images.pexels.com/photos/29343549/pexels-photo-29343549.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "kwnos Iv"
call :get desert-dawn-30099211 "https://images.pexels.com/photos/30099211/pexels-photo-30099211.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Fives TM"
call :get desert-dawn-998635 "https://images.pexels.com/photos/998635/pexels-photo-998635.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Francesco Ungaro"
call :get desert-dawn-31415641 "https://images.pexels.com/photos/31415641/pexels-photo-31415641.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Denys Gromov"
call :get desert-dawn-35752257 "https://images.pexels.com/photos/35752257/pexels-photo-35752257.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "El habib El aabbassi"
call :get desert-dawn-10803973 "https://images.pexels.com/photos/10803973/pexels-photo-10803973.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Mostafa Ft.shots"
call :get desert-dawn-3974145 "https://images.pexels.com/photos/3974145/pexels-photo-3974145.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Sharad Bhat"
call :get desert-day-38738885 "https://images.pexels.com/photos/38738885/pexels-photo-38738885.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Jazz Kaundal"
call :get desert-day-5472518 "https://images.pexels.com/photos/5472518/pexels-photo-5472518.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Ryutaro Tsukata"
call :get desert-day-412050 "https://images.pexels.com/photos/412050/pexels-photo-412050.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Tomas Anunziata"
call :get desert-day-13811651 "https://images.pexels.com/photos/13811651/pexels-photo-13811651.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Faruk Tokluoglu"
call :get desert-day-5504504 "https://images.pexels.com/photos/5504504/pexels-photo-5504504.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Mike van Schoonderwalt"
call :get desert-day-10551201 "https://images.pexels.com/photos/10551201/pexels-photo-10551201.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Zakaria HANIF"
call :get desert-dusk-50b500455f "https://images.unsplash.com/photo-1622489968558-9bf6f30dcb2a?w=2880&h=1620&fit=crop&q=80" "matt mr"
call :get desert-dusk-c92d8bc115 "https://images.unsplash.com/photo-1613169629286-8457b2ffad9f?w=2880&h=1620&fit=crop&q=80" "Parker Hilton"
call :get desert-dusk-f7572761c5 "https://images.unsplash.com/photo-1602859790151-845f2023bee8?w=2880&h=1620&fit=crop&q=80" "Parker Hilton"
call :get desert-dusk-28638937 "https://images.pexels.com/photos/28638937/pexels-photo-28638937.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Stephen Leonardi"
call :get desert-dusk-30710172 "https://images.pexels.com/photos/30710172/pexels-photo-30710172.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Stijn Dijkstra"
call :get desert-dusk-b63e5930db "https://images.unsplash.com/photo-1769537145747-ff380b863f49?w=2880&h=1620&fit=crop&q=80" "Mario Dominguez"
call :get desert-night-8357639 "https://images.pexels.com/photos/8357639/pexels-photo-8357639.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Sergey Pesterev"
call :get desert-night-35548672 "https://images.pexels.com/photos/35548672/pexels-photo-35548672.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Nicola Toscan"
call :get desert-night-19154726 "https://images.pexels.com/photos/19154726/pexels-photo-19154726.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Jonathan Borba"
call :get desert-night-33446662 "https://images.pexels.com/photos/33446662/pexels-photo-33446662.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Abdullah Salah"
call :get desert-night-11032567 "https://images.pexels.com/photos/11032567/pexels-photo-11032567.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Marek Piwnicki"
call :get desert-night-998642 "https://images.pexels.com/photos/998642/pexels-photo-998642.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Francesco Ungaro"
call :get brutalist-dawn-19955859 "https://images.pexels.com/photos/19955859/pexels-photo-19955859.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Francesco Sommacal"
call :get brutalist-dawn-22814306 "https://images.pexels.com/photos/22814306/pexels-photo-22814306.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Paul Buijs"
call :get brutalist-dawn-6516097 "https://images.pexels.com/photos/6516097/pexels-photo-6516097.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Amir Esrafili"
call :get brutalist-dawn-10486449 "https://images.pexels.com/photos/10486449/pexels-photo-10486449.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Amina B"
call :get brutalist-dawn-33422507 "https://images.pexels.com/photos/33422507/pexels-photo-33422507.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Lucas"
call :get brutalist-dawn-38644713 "https://images.pexels.com/photos/38644713/pexels-photo-38644713.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Pixel Bag"
call :get brutalist-day-2793444 "https://images.pexels.com/photos/2793444/pexels-photo-2793444.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Rick Han"
call :get brutalist-day-3882638 "https://images.pexels.com/photos/3882638/pexels-photo-3882638.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "d_odd_y"
call :get brutalist-day-30617082 "https://images.pexels.com/photos/30617082/pexels-photo-30617082.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Jan van der Wolf"
call :get brutalist-day-17330512 "https://images.pexels.com/photos/17330512/pexels-photo-17330512.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Artem Zhukov"
call :get brutalist-day-19905798 "https://images.pexels.com/photos/19905798/pexels-photo-19905798.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Gabriele Orzekauskaite"
call :get brutalist-day-11673953 "https://images.pexels.com/photos/11673953/pexels-photo-11673953.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Mathias Reding"
call :get brutalist-day-1337285 "https://images.pexels.com/photos/1337285/pexels-photo-1337285.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Jimmy Chan"
call :get brutalist-day-26741547 "https://images.pexels.com/photos/26741547/pexels-photo-26741547.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Ang Lee"
call :get brutalist-dusk-13862332 "https://images.pexels.com/photos/13862332/pexels-photo-13862332.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Michael Pointner"
call :get brutalist-dusk-28584394 "https://images.pexels.com/photos/28584394/pexels-photo-28584394.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Helin Gezer"
call :get brutalist-dusk-11655874 "https://images.pexels.com/photos/11655874/pexels-photo-11655874.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Le ficel"
call :get brutalist-dusk-30604023 "https://images.pexels.com/photos/30604023/pexels-photo-30604023.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Mike Norris"
call :get brutalist-dusk-14780198 "https://images.pexels.com/photos/14780198/pexels-photo-14780198.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Valeriia Slobodeniuk"
call :get brutalist-dusk-37266434 "https://images.pexels.com/photos/37266434/pexels-photo-37266434.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Shantum Singh"
call :get brutalist-night-33943173 "https://images.pexels.com/photos/33943173/pexels-photo-33943173.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Ajeet Kumar"
call :get brutalist-night-10349473 "https://images.pexels.com/photos/10349473/pexels-photo-10349473.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Francesco Ungaro"
call :get brutalist-night-1820362 "https://images.pexels.com/photos/1820362/pexels-photo-1820362.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Brett Sayles"
call :get brutalist-night-3199232 "https://images.pexels.com/photos/3199232/pexels-photo-3199232.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Zhanzat Mamytova"
call :get brutalist-night-10806196 "https://images.pexels.com/photos/10806196/pexels-photo-10806196.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Niklas Jeromin"
call :get brutalist-night-3612341 "https://images.pexels.com/photos/3612341/pexels-photo-3612341.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Lukas Hartmann"
call :get italy-dawn-13334558 "https://images.pexels.com/photos/13334558/pexels-photo-13334558.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Sergiu Valenas"
call :get italy-dawn-15570451 "https://images.pexels.com/photos/15570451/pexels-photo-15570451.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Mihai Vlasceanu"
call :get italy-dawn-35424336 "https://images.pexels.com/photos/35424336/pexels-photo-35424336.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Magda Ehlers"
call :get italy-dawn-12464304 "https://images.pexels.com/photos/12464304/pexels-photo-12464304.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "K"
call :get italy-dawn-26976206 "https://images.pexels.com/photos/26976206/pexels-photo-26976206.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Josh Withers"
call :get italy-dawn-30222761 "https://images.pexels.com/photos/30222761/pexels-photo-30222761.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Duc Tinh Ngo"
call :get italy-day-17807444 "https://images.pexels.com/photos/17807444/pexels-photo-17807444.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Matteo Parisi"
call :get italy-day-36804947 "https://images.pexels.com/photos/36804947/pexels-photo-36804947.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Nade Lozance"
call :get italy-day-19900429 "https://images.pexels.com/photos/19900429/pexels-photo-19900429.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Alain Garcia"
call :get italy-day-12315130 "https://images.pexels.com/photos/12315130/pexels-photo-12315130.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Boris Ivas"
call :get italy-day-6090257 "https://images.pexels.com/photos/6090257/pexels-photo-6090257.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Alexander Starke"
call :get italy-day-31386736 "https://images.pexels.com/photos/31386736/pexels-photo-31386736.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Gotta Be Worth It"
call :get italy-day-36318898 "https://images.pexels.com/photos/36318898/pexels-photo-36318898.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Rares Cioranu"
call :get italy-day-358223 "https://images.pexels.com/photos/358223/pexels-photo-358223.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Pixabay"
call :get italy-dusk-39431284 "https://images.pexels.com/photos/39431284/pexels-photo-39431284.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Kevin Reber"
call :get italy-dusk-33329103 "https://images.pexels.com/photos/33329103/pexels-photo-33329103.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Leo Shao"
call :get italy-dusk-28273691 "https://images.pexels.com/photos/28273691/pexels-photo-28273691.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Kai Pro"
call :get italy-dusk-37191356 "https://images.pexels.com/photos/37191356/pexels-photo-37191356.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Aliguieri"
call :get italy-dusk-30861099 "https://images.pexels.com/photos/30861099/pexels-photo-30861099.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Duc Tinh Ngo"
call :get italy-dusk-38454404 "https://images.pexels.com/photos/38454404/pexels-photo-38454404.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Mihaela Claudia Puscas"
call :get italy-night-6090245 "https://images.pexels.com/photos/6090245/pexels-photo-6090245.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Alexander Starke"
call :get italy-night-4987276 "https://images.pexels.com/photos/4987276/pexels-photo-4987276.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Henry Bauer"
call :get italy-night-37114069 "https://images.pexels.com/photos/37114069/pexels-photo-37114069.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "GYGeorge"
call :get italy-night-28539465 "https://images.pexels.com/photos/28539465/pexels-photo-28539465.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Sergey Guk"
call :get italy-night-1428586 "https://images.pexels.com/photos/1428586/pexels-photo-1428586.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Narcisa Aciko"
call :get italy-night-4317332 "https://images.pexels.com/photos/4317332/pexels-photo-4317332.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Paolo Razzauti"
call :get canada-dawn-5683362 "https://images.pexels.com/photos/5683362/pexels-photo-5683362.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Tobias Waibl"
call :get canada-dawn-5877702 "https://images.pexels.com/photos/5877702/pexels-photo-5877702.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Adi K"
call :get canada-dawn-19552308 "https://images.pexels.com/photos/19552308/pexels-photo-19552308.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "David Josephson"
call :get canada-dawn-6272229 "https://images.pexels.com/photos/6272229/pexels-photo-6272229.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Enric Cruz Lopez"
call :get canada-dawn-28811917 "https://images.pexels.com/photos/28811917/pexels-photo-28811917.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Luke Miller"
call :get canada-dawn-28028982 "https://images.pexels.com/photos/28028982/pexels-photo-28028982.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Nunzio Guerrera"
call :get canada-day-7277046 "https://images.pexels.com/photos/7277046/pexels-photo-7277046.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Rachel Claire"
call :get canada-day-33730307 "https://images.pexels.com/photos/33730307/pexels-photo-33730307.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Roman Lukyanenko"
call :get canada-day-7054236 "https://images.pexels.com/photos/7054236/pexels-photo-7054236.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Alberta Studios"
call :get canada-day-13724338 "https://images.pexels.com/photos/13724338/pexels-photo-13724338.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Zetong Li"
call :get canada-day-12985506 "https://images.pexels.com/photos/12985506/pexels-photo-12985506.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Chrissy T"
call :get canada-day-33894064 "https://images.pexels.com/photos/33894064/pexels-photo-33894064.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Andrew Patrick Photo"
call :get canada-day-19120115 "https://images.pexels.com/photos/19120115/pexels-photo-19120115.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Eddson Lens"
call :get canada-day-24244130 "https://images.pexels.com/photos/24244130/pexels-photo-24244130.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Max Vyolsen"
call :get canada-dusk-36185626 "https://images.pexels.com/photos/36185626/pexels-photo-36185626.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Nunzio Guerrera"
call :get canada-dusk-34037966 "https://images.pexels.com/photos/34037966/pexels-photo-34037966.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Sergey Guk"
call :get canada-dusk-12905874 "https://images.pexels.com/photos/12905874/pexels-photo-12905874.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Alizain Hirani"
call :get canada-dusk-5754973 "https://images.pexels.com/photos/5754973/pexels-photo-5754973.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "James Wheeler"
call :get canada-dusk-23414499 "https://images.pexels.com/photos/23414499/pexels-photo-23414499.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Rhys Abel"
call :get canada-dusk-32131628 "https://images.pexels.com/photos/32131628/pexels-photo-32131628.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Arjay Neyra"
call :get canada-night-26646276 "https://images.pexels.com/photos/26646276/pexels-photo-26646276.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Funky Fresh Traveles"
call :get canada-night-38294871 "https://images.pexels.com/photos/38294871/pexels-photo-38294871.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Sindre Fjerdingby Korsviken"
call :get canada-night-35815153 "https://images.pexels.com/photos/35815153/pexels-photo-35815153.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Adi K"
call :get canada-night-8601965 "https://images.pexels.com/photos/8601965/pexels-photo-8601965.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Viktor Kulikov"
call :get canada-night-5673020 "https://images.pexels.com/photos/5673020/pexels-photo-5673020.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Ken Cheung"
call :get canada-night-26960786 "https://images.pexels.com/photos/26960786/pexels-photo-26960786.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Kriz Ly"
call :get autumn-dawn-30438564 "https://images.pexels.com/photos/30438564/pexels-photo-30438564.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Feyruz Aslanov"
call :get autumn-dawn-38037931 "https://images.pexels.com/photos/38037931/pexels-photo-38037931.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Karel Drozda"
call :get autumn-dawn-34408242 "https://images.pexels.com/photos/34408242/pexels-photo-34408242.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Aurelijus U."
call :get autumn-dawn-29231575 "https://images.pexels.com/photos/29231575/pexels-photo-29231575.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Christina & Peter"
call :get autumn-dawn-29677148 "https://images.pexels.com/photos/29677148/pexels-photo-29677148.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Fabrizzio Alo"
call :get autumn-dawn-5837855 "https://images.pexels.com/photos/5837855/pexels-photo-5837855.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Mathias Reding"
call :get autumn-day-34233922 "https://images.pexels.com/photos/34233922/pexels-photo-34233922.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Michael Hamments"
call :get autumn-day-14237904 "https://images.pexels.com/photos/14237904/pexels-photo-14237904.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Imad Clicks"
call :get autumn-day-28893931 "https://images.pexels.com/photos/28893931/pexels-photo-28893931.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Aslam Athanikkal"
call :get autumn-day-11902799 "https://images.pexels.com/photos/11902799/pexels-photo-11902799.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Bryan Smith"
call :get autumn-day-1545347 "https://images.pexels.com/photos/1545347/pexels-photo-1545347.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "David Bartus"
call :get autumn-day-29518950 "https://images.pexels.com/photos/29518950/pexels-photo-29518950.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Marcio Konno"
call :get autumn-day-14780108 "https://images.pexels.com/photos/14780108/pexels-photo-14780108.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Tom Fisk"
call :get autumn-day-34939189 "https://images.pexels.com/photos/34939189/pexels-photo-34939189.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Alan Wang"
call :get autumn-dusk-32315631 "https://images.pexels.com/photos/32315631/pexels-photo-32315631.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Sherry"
call :get autumn-dusk-29239911 "https://images.pexels.com/photos/29239911/pexels-photo-29239911.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Christina & Peter"
call :get autumn-dusk-10183409 "https://images.pexels.com/photos/10183409/pexels-photo-10183409.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Manuel Torres Garcia"
call :get autumn-dusk-14730101 "https://images.pexels.com/photos/14730101/pexels-photo-14730101.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Eberhard Grossgasteiger"
call :get autumn-dusk-34490278 "https://images.pexels.com/photos/34490278/pexels-photo-34490278.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Fabio Photo"
call :get autumn-dusk-17410310 "https://images.pexels.com/photos/17410310/pexels-photo-17410310.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Brian Huynh"
call :get autumn-night-15506959 "https://images.pexels.com/photos/15506959/pexels-photo-15506959.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Amel Uzunovic"
call :get autumn-night-16647489 "https://images.pexels.com/photos/16647489/pexels-photo-16647489.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Dmitry Roshchupkin"
call :get autumn-night-18928472 "https://images.pexels.com/photos/18928472/pexels-photo-18928472.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Luke Miller"
call :get autumn-night-11850828 "https://images.pexels.com/photos/11850828/pexels-photo-11850828.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Chris F"
call :get autumn-night-8631540 "https://images.pexels.com/photos/8631540/pexels-photo-8631540.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Ilya Tolstonozhenko"
call :get autumn-night-5871553 "https://images.pexels.com/photos/5871553/pexels-photo-5871553.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Andrea Bova"
call :get gothic-dawn-37808974 "https://images.pexels.com/photos/37808974/pexels-photo-37808974.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Lewis Ashton"
call :get gothic-dawn-17364095 "https://images.pexels.com/photos/17364095/pexels-photo-17364095.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Kevin et Laurianne Langlais"
call :get gothic-dawn-30341467 "https://images.pexels.com/photos/30341467/pexels-photo-30341467.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Gul Isik"
call :get gothic-dawn-39627092 "https://images.pexels.com/photos/39627092/pexels-photo-39627092.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Bernie Andrew"
call :get gothic-dawn-11964415 "https://images.pexels.com/photos/11964415/pexels-photo-11964415.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Zekai Zhu"
call :get gothic-dawn-19964011 "https://images.pexels.com/photos/19964011/pexels-photo-19964011.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Sonny Vermeer"
call :get gothic-day-34451609 "https://images.pexels.com/photos/34451609/pexels-photo-34451609.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Valentine Kulikov"
call :get gothic-day-28683783 "https://images.pexels.com/photos/28683783/pexels-photo-28683783.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Gavin Young"
call :get gothic-day-28120765 "https://images.pexels.com/photos/28120765/pexels-photo-28120765.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Duna Jbara"
call :get gothic-day-11154888 "https://images.pexels.com/photos/11154888/pexels-photo-11154888.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Piotr Wojnowski"
call :get gothic-day-1796720 "https://images.pexels.com/photos/1796720/pexels-photo-1796720.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Chait Goli"
call :get gothic-day-31269492 "https://images.pexels.com/photos/31269492/pexels-photo-31269492.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Michael D Beckwith"
call :get gothic-day-12233830 "https://images.pexels.com/photos/12233830/pexels-photo-12233830.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Szymon Shields"
call :get gothic-day-12787468 "https://images.pexels.com/photos/12787468/pexels-photo-12787468.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Magda Ehlers"
call :get gothic-dusk-5893099 "https://images.pexels.com/photos/5893099/pexels-photo-5893099.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Sinitta Leunen"
call :get gothic-dusk-28586330 "https://images.pexels.com/photos/28586330/pexels-photo-28586330.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Mario Spencer"
call :get gothic-dusk-5517172 "https://images.pexels.com/photos/5517172/pexels-photo-5517172.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Andrej Zeman"
call :get gothic-dusk-16827639 "https://images.pexels.com/photos/16827639/pexels-photo-16827639.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Carmen Dominguez"
call :get gothic-dusk-35400486 "https://images.pexels.com/photos/35400486/pexels-photo-35400486.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Dick Scholten"
call :get gothic-dusk-11827684 "https://images.pexels.com/photos/11827684/pexels-photo-11827684.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Zekai Zhu"
call :get gothic-night-35829613 "https://images.pexels.com/photos/35829613/pexels-photo-35829613.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Igor Passchier"
call :get gothic-night-20684079 "https://images.pexels.com/photos/20684079/pexels-photo-20684079.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Clement Proust"
call :get gothic-night-37423357 "https://images.pexels.com/photos/37423357/pexels-photo-37423357.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Michael D Beckwith"
call :get gothic-night-36631587 "https://images.pexels.com/photos/36631587/pexels-photo-36631587.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Yasar Baskurt"
call :get gothic-night-18668994 "https://images.pexels.com/photos/18668994/pexels-photo-18668994.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Line Knipst"
call :get gothic-night-15770539 "https://images.pexels.com/photos/15770539/pexels-photo-15770539.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Hoang Vu"
call :get lunch-6344695 "https://images.pexels.com/photos/6344695/pexels-photo-6344695.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Christian Buergi"
call :get lunch-2583495 "https://images.pexels.com/photos/2583495/pexels-photo-2583495.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Guillaume Hankenne"
call :get lunch-28441558 "https://images.pexels.com/photos/28441558/pexels-photo-28441558.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "K"
call :get lunch-6338424 "https://images.pexels.com/photos/6338424/pexels-photo-6338424.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Sven Pieren"
call :get cockpit-36363143 "https://images.pexels.com/photos/36363143/pexels-photo-36363143.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Josh Sorenson"
call :get cockpit-1714202 "https://images.pexels.com/photos/1714202/pexels-photo-1714202.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Josh Sorenson"
call :get cockpit-4374464 "https://images.pexels.com/photos/4374464/pexels-photo-4374464.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Prateek Katyal"
call :get cockpit-18471414 "https://images.pexels.com/photos/18471414/pexels-photo-18471414.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "Ludovic Delot"
call :get cockpit-7858258 "https://images.pexels.com/photos/7858258/pexels-photo-7858258.jpeg?auto=compress&cs=tinysrgb&w=2880&h=1620&fit=crop" "cottonbro studio"
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
