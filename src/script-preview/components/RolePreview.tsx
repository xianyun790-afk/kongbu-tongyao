import {useState} from 'react';
import {ArrowRight, Check, Copy, Bookmark} from 'lucide-react';
import Modal from './Modal';
import {claimText, type Role} from '../content';

export default function RolePreview({role, saved, onSave, onClose}: {role: Role; saved: boolean; onSave: () => void; onClose: () => void}) {
  const [copy, setCopy] = useState<'idle' | 'done' | 'failed'>('idle');
  async function copyClaim() {
    try { await navigator.clipboard.writeText(claimText(role)); setCopy('done'); }
    catch { setCopy('failed'); }
  }

  return <Modal title={role.name + ' · 公开角色介绍'} onClose={onClose} className="role-dialog">
    <div className="role-reading">
      <p className="eyebrow">公开角色</p>
      <div className="role-title"><h2>{role.name}</h2><span>{role.job}</span></div>
      <p className="role-description">{role.description}</p>
      <dl className="role-details"><div><dt>与这个人有关</dt><dd>{role.object}</dd></div><div><dt>你可能喜欢的方向</dt><dd>{role.preference}</dd></div></dl>
      <p className="quiet-note">观察方向仅供选角参考。角色不限玩家性别。</p>
      <div className="role-actions"><button className="button primary" onClick={() => void copyClaim()}>{copy === 'done' ? <Check size={16}/> : <Copy size={16}/>} {copy === 'done' ? '选角意向已复制' : '复制选角意向'}</button><button className="text-link preference-button" onClick={onSave} aria-pressed={saved}>{saved ? <Check size={16}/> : <Bookmark size={16}/>} {saved ? '取消偏好' : '记下偏好'}</button></div>
      <p className="claim-note" role="status">{copy === 'done' ? '请发给邀请你的人，确认后私聊领取自己的第一轮剧本。' : '选角意向由邀请者确认；记下偏好只保存在这台设备。'}</p>
      {copy === 'failed' && <label className="copy-fallback">自动复制未成功，请手动选择下方文字。<textarea readOnly value={claimText(role)} rows={4} onFocus={event => event.currentTarget.select()}/></label>}
      <button className="text-link role-back" onClick={onClose}>继续看看其他角色<ArrowRight size={15}/></button>
    </div>
  </Modal>;
}
