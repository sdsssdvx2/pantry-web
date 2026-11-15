export function createRecipePager(pageSize=24){
 const size=Number.isInteger(pageSize)&&pageSize>0?pageSize:24;
 let limit=size,lastKey=null;
 return {
  page(ids){
   const key=ids.join('\u0000');
   if(key!==lastKey){lastKey=key;limit=size;}
   const visible=Math.min(limit,ids.length);
   return {limit:visible,hasMore:visible<ids.length,remaining:Math.max(0,ids.length-visible)};
  },
  more(){limit+=size;},
  reset(){lastKey=null;limit=size;}
 };
}
