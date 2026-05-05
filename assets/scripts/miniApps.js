import {DataIntegrity} from './dataintegrity.js';
import {News} from './news.js';
import {URLLoader} from './urlLoader.js';
const APPS=[
  DataIntegrity,
  News,
  URLLoader,
];
export class MiniApps {
  constructor(chart,api){
    this.chart=chart;
    this.api=api;
    this._active=null;
  }
  getApps(){return APPS;}
  open(AppClass,sidebar){
    this._active=new AppClass(this.chart,this.api);
    sidebar._openMiniApp(this._active);
  }
  close(){
    if(this._active&&this._active.destroy) this._active.destroy();
    this._active=null;
  }
}