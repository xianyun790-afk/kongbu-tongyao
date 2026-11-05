/** Browser PCM -> mono 16-bit WAV for the local recognizer. */
export function encodeSpeechWav(samples:Float32Array,inputRate:number,outputRate=16000):ArrayBuffer {
 const count=Math.floor(samples.length*outputRate/inputRate),buffer=new ArrayBuffer(44+count*2),view=new DataView(buffer);
 const word=(offset:number,text:string)=>{for(let i=0;i<text.length;i++)view.setUint8(offset+i,text.charCodeAt(i));};
 word(0,'RIFF');view.setUint32(4,36+count*2,true);word(8,'WAVE');word(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,outputRate,true);view.setUint32(28,outputRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);word(36,'data');view.setUint32(40,count*2,true);
 const ratio=inputRate/outputRate;
 for(let i=0;i<count;i++){
  const start=Math.floor(i*ratio),end=Math.min(samples.length,Math.max(start+1,Math.floor((i+1)*ratio)));let value=0;
  for(let n=start;n<end;n++)value+=samples[n];value=Math.max(-1,Math.min(1,value/(end-start)));
  view.setInt16(44+i*2,value<0?value*32768:value*32767,true);
 }
 return buffer;
}
