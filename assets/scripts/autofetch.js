import {storage} from './storage.js';
import {toast} from './message.js';
export const autofetchEnabled={_inst:null,set(v){this._inst?.setEnabled(v)}};
export class AutoFetch {
  constructor(chart){
    this._chart=chart;this._fetching=false;this._exhausted=false;this._unsub=null;
    this._handler=()=>this._check();
    chart._chartOn('load',()=>this.reset());
    if(storage.getAutofetch()) this._attach();
  }
  setEnabled(v){v?this._attach():this._detach()}
  reset(){this._exhausted=false;this._fetching=false}
  _attach(){
    if(this._unsub) return;
    const ts=this._chart._chart.timeScale();
    ts.subscribeVisibleTimeRangeChange(this._handler);
    this._unsub=()=>ts.unsubscribeVisibleTimeRangeChange(this._handler);
  }
  _detach(){this._unsub?.();this._unsub=null}
  _check(){
    if(!storage.getAutofetch()||this._fetching||this._exhausted) return;
    const data=this._chart._getCurrentData();
    if(data.length<20) return;
    const range=this._chart._chart.timeScale().getVisibleRange();
    if(!range) return;
    const count=data.filter(c=>{const t=this._chart._shiftTime(c.time);return t>=range.from&&t<=range.to}).length;
    if(count<=10) this._fetch();
  }
  async _fetch(){
    this._fetching=true;
    const prev=this._chart._getCurrentData().length;
    await this._chart._extendBefore(200,true);
    const next=this._chart._getCurrentData().length;
    this._fetching=false;
    if(next===prev){this._exhausted=true;toast('No more data','warn')}
  }
}