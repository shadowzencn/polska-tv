"""Curated channel metadata (Chinese descriptions + official websites), keyed by iptv-org tvg-id."""

CATEGORIES = ["新闻", "综合", "地方台", "体育", "电影剧集", "纪录片", "娱乐", "音乐", "少儿", "宗教"]

CHANNELS = [
    # 新闻
    ("TVPInfo.pl", "TVP Info", "新闻", "波兰公共广播电视台 TVP 旗下 24 小时新闻频道，播出国内外新闻、时事评论和重大事件直播。", "https://www.tvp.info/"),
    ("TVPWorld.pl", "TVP World", "新闻", "TVP 的英语国际新闻频道，以中东欧视角报道波兰及全球新闻。", "https://tvpworld.com/"),
    ("Euronews.pl", "Euronews 欧洲新闻台", "新闻", "欧洲新闻台（Euronews），全天候报道欧洲及全球新闻、财经与文化资讯。", "https://pl.euronews.com/"),
    ("SuperExpressTV.pl", "Super Express TV", "新闻", "波兰《超级快报》（Super Express）旗下电视频道，播出新闻、访谈、政论和娱乐资讯。", "https://tv.se.mediateka.pl/"),
    ("TelewizjaBiznesowa.pl", "Telewizja Biznesowa", "新闻", "波兰财经频道，聚焦经济、金融市场、企业经营与投资资讯。", "https://telewizjabiznesowa.pl/"),
    ("WPolscePL.pl", "wPolsce", "新闻", "Fratria 传媒集团旗下的新闻时事频道（现品牌 wPolsce24），以政治评论和访谈节目为主。", "https://wpolsce24.tv/"),
    ("NewsWorld.hk", "NewsWorld", "新闻", "英语国际新闻频道，提供全球要闻、财经和科技报道（FAST 免费频道）。", "https://www.lightninginternational.net/"),
    # 综合
    ("TVPPolonia.pl", "TVP Polonia", "综合", "TVP 面向海外波兰侨民的国际频道，播出 TVP 自制电视剧、新闻、娱乐与文化节目。", "https://polonia.tvp.pl/"),
    ("TVPuls.pl", "TV Puls", "综合", "波兰主要私营综合频道之一，以电视剧、电影、娱乐节目和体育转播为主。", "https://tvpuls.pl/"),
    ("Puls2.pl", "Puls 2", "少儿", "TV Puls 旗下姐妹频道，白天主打动画和儿童节目，晚间播出电影与剧集。", "https://puls2.pl/"),
    ("NewTV.pl", "NewTV", "综合", "波兰综合娱乐频道，播出娱乐、生活方式和综艺类节目。", ""),
    # 地方台
    ("TVASTA.pl", "TV ASTA", "地方台", "大波兰省皮瓦（Piła）地区电视台，报道本地新闻、文化和社区活动。", "https://tvasta.pl/"),
    ("TVKStella.pl", "TVK Stella", "地方台", "斯塔洛瓦沃拉（Stalowa Wola）有线电视台，播出本地新闻与活动报道。", "https://tvkstella.pl/"),
    ("TelewizjaJaslo.pl", "Telewizja Jasło", "地方台", "喀尔巴阡山省亚斯沃（Jasło）地方电视台，关注本地时事与重要活动。", "https://tvjaslo.pl/"),
    ("TelewizjaRegionalnaZary.pl", "Telewizja Regionalna Żary", "地方台", "卢布斯卡省扎雷（Żary）地区电视台，播出本地新闻和社区节目。", "https://telewizjazary.pl/"),
    ("TVRegionalnaLubin.pl", "TV Regionalna Lubin", "地方台", "下西里西亚省卢宾（Lubin）地区电视台，报道本地新闻与活动。", ""),
    ("BialogardzkaTelewizjaKablowa.pl", "Białogardzka Telewizja Kablowa", "地方台", "西波美拉尼亚省比亚沃加德（Białogard）有线电视台，由当地住房合作社运营。", "https://btk.bsmbialogard.pl/"),
    ("TVTorun.pl", "TV Toruń", "地方台", "历史名城托伦（Toruń）的城市电视台，播出本地新闻和活动直播（非 24 小时）。", "https://tvtorun.pl/"),
    ("TVKujawy.pl", "TV Kujawy", "地方台", "库亚维（Kujawy）地区电视台，播出地方新闻与专题节目（非 24 小时）。", ""),
    ("TelewizjaRelax.pl", "Telewizja Relax", "地方台", "波兰地方综合电视台，播出本地资讯、文化与休闲节目。", ""),
    ("TelewizjaiTTV.pl", "Telewizja iTTV", "地方台", "波兰网络电视台，提供活动、体育和文化活动的网络直播。", "https://ittv.pl/"),
    ("TwojaTV.pl", "Twoja.TV", "地方台", "波兰网络电视台，播出地方新闻、访谈和娱乐节目。", "https://twoja.tv/"),
    # 体育
    ("TOPBarca.pl", "TOP Barça", "体育", "巴塞罗那足球俱乐部官方内容频道，播出经典比赛、球星专题和俱乐部节目。", "https://www.fcbarcelona.com/"),
    ("RACERInternational.pl", "RACER International", "体育", "赛车运动频道，涵盖越野赛、摩托车和各类赛车赛事与节目。", "https://www.racertv.com/"),
    ("GloryKickboxing.us", "GLORY Kickboxing", "体育", "全球顶级踢拳赛事 GLORY 的官方频道，播出比赛回放与精彩集锦。", "https://www.glorykickboxing.com/"),
    ("PFLMMA.us", "PFL MMA", "体育", "职业格斗联盟（PFL）综合格斗赛事频道。", "https://pflmma.com/"),
    ("TNAWrestlingChannel.pl", "TNA Wrestling", "体育", "美国职业摔角联盟 TNA 的官方频道，播出经典比赛和节目。", "https://www.tnawrestling.com/"),
    ("MonsterJam.us", "Monster Jam", "体育", "怪兽卡车表演赛官方频道，播出飞跃、竞速和特技表演。", "https://www.monsterjam.com/"),
    ("StrongmanChampionsLeague.uk", "Strongman Champions League", "体育", "大力士冠军联赛频道，播出世界各地的大力士比赛。", "https://rightsbooster.com/fast-channels"),
    ("WorldPokerTour.us", "World Poker Tour", "体育", "世界扑克巡回赛（WPT）频道，播出德州扑克锦标赛。", "https://www.worldpokertour.com/"),
    ("WorldBilliards.pl", "World Billiards", "体育", "台球赛事频道，播出斯诺克、九球等台球比赛。", "https://www.rakuten.tv/pl"),
    # 电影剧集
    ("TopMoviesPolska.pl", "Top Movies Polska", "电影剧集", "Rakuten TV 推出的波兰免费电影频道，全天播放各类电影。", "https://www.rakuten.tv/pl"),
    ("Bigtime.pl", "Bigtime", "电影剧集", "Rakuten TV 免费电影频道（Bigtime Darmowe Filmy），以动作片和类型片为主。", "https://www.rakuten.tv/pl"),
    ("Grjngo.pl", "Grjngo", "电影剧集", "Rakuten TV 西部片频道，播出经典与现代西部电影。", "https://www.rakuten.tv/pl"),
    ("LoneStar.us", "Lone Star", "电影剧集", "美国西部题材频道，播出经典西部剧集和电影。", "https://www.thelonestarchannel.com/"),
    ("RakutenViki.us", "Rakuten Viki", "电影剧集", "Rakuten Viki 频道，播出韩剧、中剧等亚洲剧集。", "https://www.viki.com/"),
    # 纪录片
    ("AmericanCrimeChannel.pl", "American Crime Channel", "纪录片", "真实罪案纪录片频道，讲述美国著名刑事案件与调查过程。", "https://www.rakuten.tv/pl/live_channels/american-crime-channel"),
    ("DrGMedicalExaminer.pl", "Dr. G: Medical Examiner", "纪录片", "法医纪实节目《G 医生：法医》，跟随法医揭开离奇死亡背后的真相。", "https://www.rakuten.tv/pl/live_channels/filmrise-dr-g-medical-examiner"),
    ("BuzzfeedUnsolved.pl", "BuzzFeed Unsolved", "纪录片", "BuzzFeed 悬案与灵异探秘系列节目频道。", "https://www.rakuten.tv/pl/live_channels/filmrise-buzzfeed-unsolved"),
    ("ViasatExploreClassic.pl", "Viasat Explore Classic", "纪录片", "Viasat 探索类纪录片频道，涵盖探险、工程、交通与极限挑战。", "https://www.rakuten.tv/pl"),
    ("Royalworld.pl", "Royalworld", "纪录片", "王室题材频道，播出欧洲王室历史、人物与生活纪录片。", "https://www.rakuten.tv/pl/live_channels/royalworld-pl"),
    ("Moconomy.pl", "Moconomy", "纪录片", "Rakuten TV 免费纪实频道，播出商业、经济与社会类节目。", "https://www.rakuten.tv/pl"),
    # 娱乐
    ("RemontyTV.pl", "Remonty TV", "娱乐", "家装与房屋翻新主题频道，播出装修改造、DIY 与居家设计节目。", "https://remontytv.pl/"),
    ("RedCarpetTVInternational.pl", "Red Carpet TV", "娱乐", "明星娱乐资讯频道，聚焦红毯、电影节和名人动态。", "https://www.redcarpettv.com/"),
    ("FailArmy.us", "FailArmy", "娱乐", "搞笑“翻车”视频集锦频道。", "https://www.failarmy.com/"),
    ("PeopleAreAwesome.us", "People Are Awesome", "娱乐", "极限运动、神技与励志视频集锦频道。", "https://www.peopleareawesome.com/"),
    ("ThePetCollective.us", "The Pet Collective", "娱乐", "萌宠与动物趣味视频频道。", "https://www.thepetcollective.com/"),
    ("wedotvAuta.pl", "wedotv Auta", "娱乐", "wedotv 汽车主题频道，播出汽车测评、改装和赛车节目。", "https://www.wedotv.com/"),
    # 音乐
    ("4FunTV.pl", "4FUN.TV", "音乐", "波兰音乐频道，主打流行与舞曲音乐 MV、音乐榜单和娱乐节目。", "https://4fun.tv/"),
    ("Now90s00s.uk", "NOW 90s00s", "音乐", "NOW Music 旗下频道，循环播放 90 年代与 00 年代流行金曲 MV。", "https://www.nowmusic.com/"),
    ("RadiowaCzworka.pl", "Polskie Radio Czwórka", "音乐", "波兰国家电台（Polskie Radio）第四套节目的可视化直播，面向年轻听众，以音乐和文化内容为主。", "https://czworka.polskieradio.pl/"),
    ("RadioRAM.pl", "Radio RAM", "音乐", "波兰电台 Radio RAM 的可视化直播，播出流行音乐与访谈。", "https://radioram.pl/"),
    # 少儿
    ("4FunKids.pl", "4FUN KIDS", "少儿", "4FUN 旗下儿童频道，播出动画、儿歌和儿童节目。", "https://4fun.tv/kids"),
    ("CarCityAdventures.pl", "Car City Adventures", "少儿", "儿童汽车动画频道，讲述小汽车城的冒险故事。", "https://www.rakuten.tv/pl"),
    # 宗教
    ("EWTNPoland.pl", "EWTN Polska", "宗教", "天主教环球电视网（EWTN）波兰频道，播出弥撒、宗教纪录片和信仰节目。", "https://ewtn.pl/"),
]

# Bare-IP restream hosts carrying pay-TV channels without a clear rights holder; excluded.
EXCLUDED_HOSTS = {"92.114.85.87", "185.227.34.179", "57.128.210.196"}
