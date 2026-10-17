// Actual responsive UI route: header control when present, otherwise folded Menu.
// Compact annotation-only shell intentionally has no annotation-mode toggle.
async function openRoomControl(page,name){
 const direct=page.getByRole('button',{name,exact:true});
 if(await direct.isVisible()){await direct.click();return{control:name,route:'header'}}
 await page.getByRole('button',{name:'Menu',exact:true}).click();
 const checkbox=page.getByRole('menuitemcheckbox',{name,exact:true}),item=page.getByRole('menuitem',{name,exact:true});
 if(await checkbox.isVisible()){await checkbox.click();return{control:name,route:'menu-checkbox'}}
 await item.click();return{control:name,route:'menu-item'};
}
module.exports={openRoomControl};
