import {useEffect,useRef,type ReactNode} from 'react';
import {X} from 'lucide-react';
export default function Modal({title,onClose,children,className=''}:{title:string;onClose:()=>void;children:ReactNode;className?:string}){
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{
  const el=dialog.current!,previous=document.activeElement,overflow=document.body.style.overflow;
  document.body.style.overflow='hidden';el.showModal();
  return()=>{el.close();document.body.style.overflow=overflow;if(previous instanceof HTMLElement&&previous.isConnected)previous.focus({preventScroll:true});};
 },[]);
 return <dialog ref={dialog} className={'paper-dialog '+className} aria-label={title} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target!==e.currentTarget)return;const rect=e.currentTarget.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)onClose();}}>
  <header className="dialog-header"><span>白榆 · 公共阅读</span><button className="icon-button" aria-label="关闭阅读窗口" onClick={onClose}><X size={20}/></button></header>{children}
 </dialog>;
}
