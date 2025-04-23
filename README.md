# rplayLiveDownloader

auto record rplay live streaming that you want record

## how to use

### requirements

- nodejs
- ffmpeg

### install
```bash
git clone https://github.com/crossSiteKikyo/rplayLiveDownloader.git
cd rplayLiveDownloader
npm install
```

### configuration
- json/requestor.json - requestorOid

    1. visit `https://rplay.live/myinfo`
    2. copy `User Number` to requestorOid

- json/requestor.json - \_AUTHORIZATION\_

    1. log in `https://rplay.live`
    2. open devtools
    3. execute `localStorage.getItem('_AUTHORIZATION_')`
    4. copy returned String at \_AUTHORIZATION\_

- json/creatorInfo.json - creatorOid, nickname

    1. visit creator's profile
    2. open devtools network panel
    3. refresh page and search creatorOid
    4. copy creatorOid to creatorOid
    5. you can write anything at nickname. It doesn't affect operation.
    6. repeat the above action for each creator you want to record.

### register to start program
- windows

    1. mouse right click at rplayLiveDLvbs.vbs 
    2. create shortcut
    3. Win + R and run shell:startup
    4. copy shortcut to opened file explorer

- linux

    1.
    2.

## directory structure
```
rplayLiveDownloader/
├─ json/
│  ├─ requestor.json
│  └─ creatorInfo.json
└─ data/
   ├─ creatorNickname1/
   │  ├─ 2025y02m20d_19h52m33s000.mp4
   │  └─ 2025y03m21d_20h59m33s000.mp4
   └─ creatorNickname2/
      ├─ 2025y02m10d_19h52m33s000.mp4
      └─ 2025y03m11d_20h59m33s000.mp4
```