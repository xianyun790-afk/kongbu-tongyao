class PcmCapture extends AudioWorkletProcessor {
 constructor(options){super();this.frameSize=options?.processorOptions?.frameSize===1024?1024:4096;this.samples=new Float32Array(this.frameSize);this.offset=0;}
 process(inputs){
  const input=inputs[0]?.[0];if(!input)return true;
  for(let i=0;i<input.length;i++){
   this.samples[this.offset++]=input[i];
   if(this.offset===this.samples.length){this.port.postMessage(this.samples,[this.samples.buffer]);this.samples=new Float32Array(this.frameSize);this.offset=0;}
  }
  return true;
 }
}
registerProcessor('pcm-capture',PcmCapture);
