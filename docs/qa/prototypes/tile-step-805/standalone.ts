import {mountTileStep805} from './main'
mountTileStep805(Object.fromEntries(['status','result','ink','sheet','tile','mode','run','compare'].map(id=>[id,document.getElementById(id)!])))
