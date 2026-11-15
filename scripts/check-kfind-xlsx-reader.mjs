// Integration check: use the actual vendored browser XLSX parser with an
// in-memory standards-compliant XLSX file. No network, DB, browser or fixture download.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {parseKfindTable,findKfindConflicts} from '../public/kfind-candidates.js';

const xmlEscape=s=>String(s).replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'
}[c]));
const headers=['식품코드','식품명','영양성분 함량 기준량','에너지(kcal)',
 '나트륨(mg)','제조사명','수입업체명','품목제조보고번호','식품 중량'];
const rows=[headers,
 ['P113-206050200-0008','스리라차 핫 칠리','100g',100,1400,'HUY FONG FOODS, INC.','지비코퍼레이션 (주)','2024_RD_10521','481g'],
 ['P113-501050200-0109','스리라차 핫 칠리','100g',0,1400,'HUY FONG FOODS, INC.','지비코퍼레이션 (주)','24US02F00D3','481g']];
const col=i=>{let s='';for(i++;i;i=Math.floor((i-1)/26))s=String.fromCharCode(65+(i-1)%26)+s;return s;};
const sheetRows=rows.map((row,r)=>
 '<row r="'+(r+1)+'">'+row.map((v,c)=>{
  const cell=col(c)+(r+1);
  return typeof v==='number'
   ?'<c r="'+cell+'"><v>'+v+'</v></c>'
   :'<c r="'+cell+'" t="inlineStr"><is><t>'+xmlEscape(v)+'</t></is></c>';
 }).join('')+'</row>').join('');
const xlsx={
 '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
 '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
 '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+
 '<Default Extension="xml" ContentType="application/xml"/>'+
 '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+
 '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
 '_rels/.rels':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
 '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
 '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
 'xl/workbook.xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
 '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'+
 '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>',
 'xl/_rels/workbook.xml.rels':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
 '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
 '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
 'xl/worksheets/sheet1.xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
 '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+sheetRows+'</sheetData></worksheet>'
};
const crc32=data=>{
 let crc=0xffffffff;
 for(const byte of data){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^(crc&1?0xedb88320:0);}
 return (crc^0xffffffff)>>>0;
};
function packZip(files){
 const parts=[],directory=[];let offset=0;
 for(const [filename,xml] of Object.entries(files)){
  const name=Buffer.from(filename,'utf8'),body=Buffer.from(xml,'utf8');
  const crc=crc32(body);
  const local=Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);
  local.writeUInt16LE(0x0800,6);local.writeUInt16LE(0,8);
  local.writeUInt32LE(crc,14);local.writeUInt32LE(body.length,18);
  local.writeUInt32LE(body.length,22);local.writeUInt16LE(name.length,26);
  parts.push(local,name,body);
  const central=Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);
  central.writeUInt16LE(20,6);central.writeUInt16LE(0x0800,8);
  central.writeUInt32LE(crc,16);central.writeUInt32LE(body.length,20);
  central.writeUInt32LE(body.length,24);central.writeUInt16LE(name.length,28);
  central.writeUInt32LE(offset,42);
  directory.push(central,name);
  offset+=local.length+name.length+body.length;
 }
 const cdir=Buffer.concat(directory);
 const ending=Buffer.alloc(22);
 ending.writeUInt32LE(0x06054b50,0);
 ending.writeUInt16LE(Object.keys(files).length,8);
 ending.writeUInt16LE(Object.keys(files).length,10);
 ending.writeUInt32LE(cdir.length,12);ending.writeUInt32LE(offset,16);
 return Buffer.concat([...parts,cdir,ending]);
}
const bytes=packZip(xlsx);
const vendor=readFileSync(new URL('../public/vendor/read-excel-file-9.3.14.min.js',import.meta.url),'utf8');
assert(!/cdn\.jsdelivr\.net|unpkg\.com/i.test(vendor),'Vendored parser must not load third-party CDN code');
const globals={Buffer,ArrayBuffer,Uint8Array,DataView,Promise,TextEncoder,TextDecoder,
 Blob,File:globalThis.File,setTimeout,clearTimeout,console};
globals.self=globals;globals.window=globals;globals.globalThis=globals;
runInNewContext(vendor,globals,{timeout:3000,filename:'read-excel-file-9.3.14.min.js'});
assert.equal(typeof globals.readXlsxFile,'function','UMD browser reader must initialize');
const arrayBuffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
const sheets=await globals.readXlsxFile(arrayBuffer);
assert.equal(sheets.length,1,'The actual v9 browser UMD reader returns an array of sheets');
assert.equal(sheets[0].sheet,'Sheet1');
const got=sheets[0].data;
assert.equal(got.length,3);
assert.equal(got[0][0],'식품코드');
const parsed=parseKfindTable(got);
assert.equal(parsed[0].nutrition.energy,100);
assert.equal(parsed[1].nutrition.energy,0);
assert.equal(parsed[0].nutrition.sodium,1400);
assert.equal(findKfindConflicts(parsed).size,2);
console.log('K-FIND actual offline XLSX reader + conflicting export rows PASS');
