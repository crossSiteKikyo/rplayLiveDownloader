/*
비정상종료되어 합쳐지지 않은 비디오들은 어떻게해야할까?
*/

import axios from 'axios';
import * as fs from 'node:fs';
import { exec } from 'node:child_process';
import { join } from 'path';

// 일반적인 요청일 때 헤더
const rplayRequestHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:136.0) Gecko/20100101 Firefox/136.0',
    'Origin': 'https://rplay.live',
    'Referer': 'https://rplay.live/',
    'Accept-Language': 'ko-KR,ko;q=0.8,en-US;q=0.5,en;q=0.3'
}

// key2요청일 때 authorization이 필요함.
const rplayRequestHeadersWithAuthorization = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:136.0) Gecko/20100101 Firefox/136.0',
    'Origin': 'https://rplay.live',
    'Referer': 'https://rplay.live/',
    'Accept-Language': 'ko-KR,ko;q=0.8,en-US;q=0.5,en;q=0.3',
    // 'Authorization': '',
}

const infoObj = {
    requestorOid: '',
    creators: [
        // {creatorOid, nickname, accessible, streamLive, key2, streamVideoUrl, streamStartTime}
    ]
};

const log = {
    makeLogDir: function () {
        if (!fs.existsSync("./log")) {
            fs.mkdirSync("./log", { recursive: true });
        }
    },
    errorToFile: function (string) {
        this.makeLogDir();
        fs.appendFile("./log/errorLog.txt", `(${new Date().toLocaleString()}) ${string}\n`, { encoding: "utf8" }, (err) => {
            if (err) {
                console.error('에러 로그 appendFile() 에러');
            }
        })
    },
    creatorStartEndToFile: function (string) {
        this.makeLogDir();
        fs.appendFile("./log/creatorStartEndLog.txt", `(${new Date().toLocaleString()}) ${string}\n`, { encoding: "utf8" }, (err) => {
            if (err) {
                console.error('에러 로그 appendFile() 에러');
            }
        })
    },
    downloadSucceedToFile: function (string) {
        this.makeLogDir();
        fs.appendFile("./log/downloadSucceedLog.txt", `(${new Date().toLocaleString()}) ${string}\n`, { encoding: "utf8" }, (err) => {
            if (err) {
                console.error('에러 로그 appendFile() 에러');
            }
        })
    }
}

async function main() {
    // 정보 파일에서 가져오기
    setInterval(getCreatorInfoAndRequestorOid, 6000);
    // 5초마다 생방송 확인
    setInterval(checkCreatorsLive, 5000);
    // 5초마다 생방송중이라면 다운
    setInterval(downCreatorsVideos, 5000);
    // 영상 합치기는 나중에. 추가
}

// requestor정보와 크리에이터 정보 파일에서 가져오기
function getCreatorInfoAndRequestorOid() {
    // requestor정보
    let data;
    if(fs.existsSync('json/requestor-dev.json'))
        data = fs.readFileSync("./json/requestor-dev.json", { encoding: "utf8" });
    else
        data = fs.readFileSync("./json/requestor.json", { encoding: "utf8" });
    data = JSON.parse(data);
    infoObj.requestorOid = data.requestorOid;
    rplayRequestHeadersWithAuthorization['Authorization'] = data["_AUTHORIZATION_"];

    // 크리에이터 정보
    if(fs.existsSync('json/creatorInfo-dev.json'))
        data = fs.readFileSync("./json/creatorInfo-dev.json", { encoding: "utf8" });
    else
        data = fs.readFileSync("./json/creatorInfo.json", { encoding: "utf8" });
    let creatorInfo = JSON.parse(data);
    // 기존 creatorOid들.
    let currentCreatorOids = infoObj.creators.map((v) => v.creatorOid);
    creatorInfo.forEach((c) => {
        // 기존에 없는 추가된 크리에이터는 추가.
        if (!currentCreatorOids.includes(c.creatorOid))
            infoObj.creators.push({ creatorOid: c.creatorOid, nickname: c.nickname, streamLive: false });
    })
    // 새로운 creatorOid들
    let newCreatorOids = creatorInfo.map((v) => v.creatorOid);
    // 리스트에서 제거된 크리에이터들은 제거.
    for (let i = 0; i < infoObj.creators.length; i++) {
        if (!newCreatorOids.includes(infoObj.creators[i].creatorOid)) {
            infoObj.creators.splice(i, 1); i--;
        }
    }
}

// 모든 크리에이터의 방송 상황 체크
async function checkCreatorsLive() {
    for (let creator of infoObj.creators) {
        checkCreatorLive(creator)
    }
}

// 종료된 방송인지 진행중 방송인지 판단한다.
async function checkCreatorLive(creator) {
    try {
        const response = await axios.get('https://api.rplay-cdn.com/live/play', {
            params: {
                creatorOid: creator.creatorOid,
                requestorOid: infoObj.requestorOid,
                lang: 'ko',
                loginType: 'plax',
                key: null
            },
            headers: rplayRequestHeadersWithAuthorization,
            responseType: 'json',
        });
        const data = response.data;
        creator.nickname = data.creatorMetadata.nickname;
        // 스트림 시작 시간
        creator.streamStartTime = ISOStringToKoreaDateString(data.streamStartTime);
        // 보는게 불가능한 상태에서 가능한 상태로 변했다면 녹화시작.
        if (!(creator.streamLive == true && creator.accessible == true)) {
            if(data.streamState == "live" && data.accessible == true) {
                log.creatorStartEndToFile(`${creator.nickname} 크리에이터 방송시작시간: ${creator.streamStartTime}`);
            }
        }
        // 보는게 가능한 상태에서 불가능한 상태로 변한다면 녹화종료.
        if (creator.streamLive == true && creator.accessible == true) {
            if(data.streamState == "offline" || data.accessible == false) {
                log.creatorStartEndToFile(`${creator.nickname} 크리에이터 방송종료`);
                mergeVideos(creator);
            }
        }
        // "live"라이브중 "offline"종료
        if (data.streamState == "live") {            
            creator.streamLive = true;
        }
        else if (data.streamState == "offline") {
            creator.streamLive = false;
        }
        // 구독방 유료구독방 등 조건을 만족해야 accessible이 true가 된다.
        creator.accessible = data.accessible;
    } catch (error) {
        log.errorToFile(`${creator.nickname} 크리에이터 생방송 정보 가져오기 오류`);
        // console.log(error);
    }
}

// 영상들 합치기
async function mergeVideos(creator) {
    const path = join("data", creator.nickname, creator.streamStartTime);
    const files = fs.readdirSync(path);
    for (let i = 0; i < files.length; i++) {
        if (!files[i].match(/^[0-9]{4}y[0-9]{2}m[0-9]{2}d_[0-9]{2}h[0-9]{2}m[0-9]{2}s[0-9]{3}.ts$/)) {
            files.splice(i, 1);
            i--;
        }
    }
    files.sort();
    let str = "";
    for (const file of files) {
        str = str + `file '${file}'\n`;
    }

    fs.writeFile(join(path, "merge.txt"), str, () => {
        exec(`ffmpeg -f concat -i "${join(path, "merge.txt")}" -c copy "${join("data", creator.nickname, `${creator.streamStartTime}.mp4`)}"`, (error, stdout, stderr) => {
            if (error) {
                log.errorToFile(`ffmpeg 에러: ${error}`);
                return;
            }
            console.log("ffmpeg 끝");
            // 해당 폴더 제거
            fs.rm(path, { recursive: true, force: true }, (err) => {
                //끝나면 크리에이터 정보 삭제
                delete creator.streamStartTime;
                delete creator.streamVideoUrl;
                delete creator.key2;
            })
            // merge.txt, .ts파일들 제거
            // exec(`del "${join(path, "merge.txt")}" "${join(path, "*.ts")}"`, (error, stdout, stderr)=>{
            //     //끝나면 크리에이터 정보 삭제
            //     // {creatorOid, nickname, accessible, streamLive, key2, streamVideoUrl, streamStartTime}
            //     delete creator.streamStartTime;
            //     delete creator.streamVideoUrl;
            //     delete creator.key2;
            // });
        })
    })
}

// 생방송중이라면 영상을 다운한다.
async function downCreatorsVideos() {
    for (let creator of infoObj.creators) {
        if (creator.streamLive == true && creator.accessible == true) {
            downCreatorVideos(creator);
        }
    }
}

// 크리에이터의 다운로드한다.
async function downCreatorVideos(creator) {
    // key2라는게 없다면 가져온다.
    if (!creator.key2) {
        await getKey2(creator);
    }
    // streamPlayList 정보 가져오기.
    if (!creator.streamVideoUrl) {
        await getStreamPlayList(creator);
    }
    // videoUrl에 보내진 영상들 저장하기.
    if (creator.streamVideoUrl) {
        getStreamVideoList(creator);
    }
}

async function getKey2(creator) {
    try {
        let response = await axios.get('https://api.rplay-cdn.com/live/key2', {
            params: {
                requestorOid: infoObj.requestorOid,
                lang: 'ko',
                loginType: 'plax'
            },
            headers: rplayRequestHeadersWithAuthorization,
            responseType: 'json',
        })
        creator.key2 = response.data.authKey;
        if (!creator.key2) {
            logEmptyValue("key2", creator.key2)
        }
    } catch (error) {
        log.errorToFile(`key2 정보 가져오기 오류`);
    }
}

// streamPlayList 정보 가져오기. 화질마다의 링크가 있다.
async function getStreamPlayList(creator) {
    try {
        let response = await axios.get('https://api.rplay-cdn.com/live/stream/playlist.m3u8', {
            params: {
                creatorOid: creator.creatorOid,
                key2: creator.key2,
                country: 'KR'
            },
            headers: rplayRequestHeaders
        })
        // 각 해상도마다 videoUrl을 알아낸다.
        let playableVideosInfo = response.data.match(/#EXT-X-MEDIA[\S]+\n#EXT-X-STREAM-INF[\S]+\nhttps:[\S]+/g);
        // 여기서 가장 높은 해상도의 url을 알아내 creator.videoUrl에 저장한다.
        creator.streamVideoUrl = playableVideosInfo[0].match(/https[\S]+/)[0];
    } catch (error) {
        log.errorToFile(`${creator.nickname} 크리에이터 stream play list 정보 가져오기 오류`);
    }
}

// stream video 리스트를 다운한다.
async function getStreamVideoList(creator) {
    // axios요청 보내서 분석하고 없는 영상이라면 다운한다.
    try {
        let response = await axios.get(creator.streamVideoUrl, {
            headers: rplayRequestHeaders
        })
        // 각 비디오 부분 url을 알아낸다.
        const videosInfo = response.data.match(/#EXT-X-PROGRAM-DATE-TIME[\S]+\n#EXTINF[\S]+\nhttps:[\S]+/g);
        for (let str of videosInfo) {
            let programDateTime = str.match(/(?<=TIME:)[\S]+/)[0];
            let url = str.match(/https[\S]+/)[0];
            // 저장 공간은 data의 creatornickname의 date의 time이다.
            downloadVideo(creator, programDateTime, url);
        }
    } catch (error) {
        log.errorToFile(`${creator.nickname} 크리에이터 stream video list 정보 가져오기 오류`);
    }
}

// 비디오 다운.
async function downloadVideo(creator, programDateTime, url) {
    programDateTime = ISOStringToKoreaDateString(programDateTime);
    const dirPath = `./data/${creator.nickname}/${creator.streamStartTime}`;
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
    // 저장 공간은 data의 creatornickname의 startDate의 time이다.
    const fileNamePath = `${dirPath}/${programDateTime}.ts`;
    if (!fs.existsSync(fileNamePath)) {
        // 없다면 다운.
        downloadTsFromUrl(fileNamePath, url);
    }
}

// url에서 
async function downloadTsFromUrl(fileNamePath, url) {
    try {
        let response = await axios.get(url, {
            headers: rplayRequestHeaders,
            responseType: 'stream'
        })
        const writer = fs.createWriteStream(fileNamePath);
        response.data.pipe(writer);

        writer.on('finish', () => log.downloadSucceedToFile(`다운로드 완료: ${fileNamePath}`));
        writer.on('error', (err) => log.errorToFile(`${fileNamePath} 다운 오류`));
    } catch (error) {
        log.errorToFile(`${fileNamePath} 다운 접속 오류`);
    }
}

function ISOStringToKoreaDateString(str) {
    const date = new Date(str);
    let dateString = date.toLocaleDateString().replaceAll(' ', '');
    let [year, month, day] = dateString.split('.');
    dateString = `${year}y${month.padStart(2, '0')}m${day.padStart(2, '0')}d`;

    let timeString = date.toTimeString().slice(0, 8);
    let [hours, minutes, seconds] = timeString.split(':');
    timeString = `${hours}h${minutes}m${seconds}s`;

    const ms = String(date.getMilliseconds()).padStart(3, '0');
    return `${dateString}_${timeString}${ms}`;
    // file.match(/^[0-9]{4}y[0-9]{2}m[0-9]{2}d_[0-9]{2}h[0-9]{2}m[0-9]{2}s[0-9]{3}.ts$/)가 되어야 한다.
}

function logEmptyValue(string, val) {
    console.error(`${string}값이 없습니다. ${string}값: ${val}`);
}

main();