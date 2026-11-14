import {uid} from './model.js';

const task=(title,tagIds,notes='',children=[])=>({title,tagIds,notes,children});
export const PROJECT_TEMPLATES=[
  {id:'game',name:'Game',title:'Dự án game mới',color:'#82768f',description:'Từ ý tưởng đến bản game có thể chơi và phát hành.',summary:'Concept → GDD → Prototype → Core → Content → Playtest → Release',tasks:[
    task('Ý tưởng & phạm vi',['idea','research'],'Chốt trải nghiệm cốt lõi và phạm vi đủ nhỏ để hoàn thành.',[
      task('Xác định người chơi, thể loại và nền tảng',['research']),
      task('Viết câu giới thiệu game và điểm khác biệt',['idea']),
      task('Chốt core loop và điều kiện thắng / thua',['gameplay'],'Mô tả một vòng chơi từ hành động đến phản hồi và phần thưởng.'),
      task('Chia phạm vi: cần có, nên có, để sau',['design-document'])]),
    task('Game Design Document',['design-document'],'Tài liệu sống: cập nhật khi kiểm chứng thiết kế.',[
      task('Mô tả cơ chế chính và điều khiển',['gameplay']),
      task('Thiết kế progression và cân bằng',['gameplay']),
      task('Phác thảo màn chơi và luồng UI',['ui-ux']),
      task('Xác định phong cách hình ảnh và âm thanh',['art','audio'])]),
    task('Prototype & kiểm chứng',['prototype'], 'Chứng minh core loop có thú vị trước khi sản xuất nội dung.',[
      task('Dựng graybox có thể chơi',['prototype','gameplay'],'Dùng asset tạm, ưu tiên tốc độ thử nghiệm.',[
        task('Input, di chuyển và camera',['core-system']),
        task('Tương tác cốt lõi và phản hồi',['gameplay']),
        task('Vòng chơi hoàn chỉnh: bắt đầu → chơi → kết thúc',['prototype'])]),
      task('Playtest sớm và ghi nhận vấn đề',['testing']),
      task('Chọn cơ chế giữ lại / thay đổi',['design-document'])]),
    task('Kiến trúc & hệ thống nền',['architecture','core-system'],'Tách hệ thống dùng chung khỏi nội dung của từng màn chơi.',[
      task('Thiết lập repo, cấu trúc dự án và build',['architecture']),
      task('Game state, scene flow và dữ liệu cấu hình',['core-system']),
      task('Save / load và cài đặt',['core-system']),
      task('UI, audio manager và quản lý tài nguyên',['architecture'])]),
    task('Vertical slice & nội dung',['feature'],'Hoàn thiện một phần chơi đại diện với chất lượng mục tiêu.',[
      task('Hoàn thiện một màn chơi từ đầu đến cuối',['gameplay']),
      task('Tạo asset, animation và VFX',['art','tech-art']),
      task('Tích hợp nhạc, SFX và feedback',['audio']),
      task('Onboarding, menu và trải nghiệm người chơi',['ui-ux'])]),
    task('Playtest, sửa lỗi & tối ưu',['testing'],'Bản build ổn định trên cấu hình và nền tảng mục tiêu.',[
      task('Lập checklist test cơ chế, save và luồng màn hình',['testing']),
      task('Ghi nhận và sửa lỗi chặn trải nghiệm',['bug']),
      task('Đo FPS, bộ nhớ và thời gian tải',['optimization']),
      task('Tinh chỉnh độ khó từ phản hồi playtest',['gameplay','testing'])]),
    task('Phát hành & theo dõi',['release'], 'Chốt tiêu chí phát hành và cách xử lý lỗi sau ra mắt.',[
      task('Chuẩn bị trang giới thiệu, ảnh và trailer',['marketing']),
      task('Kiểm tra giấy phép asset và yêu cầu nền tảng',['release']),
      task('Đóng gói bản phát hành và phương án hotfix',['release']),
      task('Thu phản hồi và lập backlog phiên bản tiếp theo',['analytics','idea'])])
  ]},
  {id:'product',name:'Product',title:'Dự án product mới',color:'#8a806c',description:'Từ vấn đề người dùng đến MVP được kiểm chứng và vận hành.',summary:'Discovery → PRD → UX → Architecture → MVP → QA → Launch',tasks:[
    task('Khám phá vấn đề',['research','idea'],'Kiểm chứng nhu cầu trước khi đầu tư xây dựng.',[
      task('Xác định nhóm người dùng và tình huống sử dụng',['research']),
      task('Phỏng vấn và tổng hợp pain points',['research']),
      task('Khảo sát giải pháp hiện có',['research']),
      task('Chốt giả thuyết giá trị và chỉ số thành công',['analytics','idea'])]),
    task('PRD & phạm vi MVP',['design-document'],'Mỗi tính năng cần mục tiêu, tiêu chí chấp nhận và giới hạn rõ ràng.',[
      task('Viết problem statement và mục tiêu sản phẩm',['design-document']),
      task('Viết user stories và tiêu chí nghiệm thu',['design-document']),
      task('Ưu tiên tính năng và xác định ngoài phạm vi',['feature']),
      task('Ghi rủi ro, phụ thuộc và các giả định cần kiểm chứng',['research'])]),
    task('Thiết kế UX & prototype',['ui-ux','prototype'],'Kiểm tra người dùng có hoàn thành luồng chính hay không.',[
      task('Vẽ user flow và cấu trúc thông tin',['ui-ux']),
      task('Wireframe các màn hình chính',['ui-ux']),
      task('Prototype tương tác và usability test',['prototype','testing']),
      task('Chốt UI và trạng thái loading / empty / error',['ui-ux'])]),
    task('Kiến trúc & nền tảng',['architecture','core-system'],'Thiết kế đủ cho MVP, có đường nâng cấp khi nhu cầu tăng.',[
      task('Thiết kế mô hình dữ liệu và API',['architecture']),
      task('Thiết lập repo, môi trường và CI/CD',['architecture']),
      task('Xác thực, phân quyền và bảo vệ dữ liệu',['core-system']),
      task('Logging, giám sát và sao lưu dữ liệu',['core-system'])]),
    task('Xây dựng MVP',['feature'],'Tập trung vào một luồng tạo giá trị hoàn chỉnh.',[
      task('Triển khai luồng chính end-to-end',['feature'], 'Chọn luồng quan trọng nhất của sản phẩm và chia nhỏ theo chức năng.',[
        task('Dữ liệu, business rules và API',['core-system']),
        task('Giao diện và tích hợp API',['ui-ux','feature']),
        task('Validation và xử lý lỗi',['feature','testing'])]),
      task('Onboarding và hướng dẫn sử dụng',['ui-ux']),
      task('Gắn sự kiện đo lường cho luồng chính',['analytics'])]),
    task('Kiểm thử & sẵn sàng vận hành',['testing'],'Nghiệm thu theo PRD và kiểm tra các tình huống thất bại.',[
      task('Test nghiệp vụ, tích hợp và end-to-end',['testing']),
      task('Kiểm tra mobile và accessibility',['ui-ux','testing']),
      task('Kiểm tra bảo mật, hiệu năng và phục hồi dữ liệu',['testing','optimization']),
      task('Sửa lỗi và nghiệm thu MVP',['bug','testing'])]),
    task('Ra mắt & cải tiến',['release','analytics'],'Theo dõi kết quả thực tế để quyết định vòng phát triển tiếp theo.',[
      task('Chạy beta và thu phản hồi',['testing','research']),
      task('Chuẩn bị nội dung ra mắt và hỗ trợ người dùng',['marketing']),
      task('Deploy production và chuẩn bị rollback',['release']),
      task('Đánh giá chỉ số và ưu tiên backlog tiếp theo',['analytics','idea'])])
  ]}
];

export function templateTaskCount(template){return template.tasks.reduce(function count(sum,node){return sum+1+node.children.reduce(count,0);},0);}
export function instantiateTemplate(templateId,projectId,tags){
  const template=PROJECT_TEMPLATES.find(t=>t.id===templateId);if(!template)return [];
  const allowed=new Set(tags.map(t=>t.id));const result=[];const createdAt=new Date().toISOString();
  function append(nodes,parentId){nodes.forEach((node,order)=>{const id=uid();result.push({id,projectId,parentId,order,title:node.title,notes:node.notes,tagIds:node.tagIds.filter(id=>allowed.has(id)),done:false,attachments:[],createdAt});append(node.children,id);});}
  append(template.tasks,null);return result;
}
