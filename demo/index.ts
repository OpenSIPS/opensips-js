import OpenSIPSJS from '../src/index'
//import OpenSIPSJS from '../dist/opensips-js.es'
import { ICall, IOpenSIPSConfiguration, IRoom, RoomChangeEmitType, UAConfiguration } from '../src/types/rtc'
import { runIndicator } from '../src/helpers/volume.helper'
import { SendMessageOptions } from 'jssip/lib/Message'
import { IMessage, MSRPSessionExtended } from '../src/types/msrp'
import MSRPMessage from '../src/lib/msrp/message'
import { IndexedDBService } from './helpers/IndexedDBService'
import { getUIDFromSession } from './helpers'
import { ChangeVolumeEventType } from '../src/types/listeners'
import { MODULES } from '../src/enum/modules'
import { CallTime } from '../src/types/timer'
import { ScreenSharePlugin } from '../src/lib/janus/ScreenSharePlugin'
import { ScreenShareWhiteBoardPlugin } from '../src/lib/janus/ScreenShareWhiteBoardPlugin'
//import { StreamMaskPlugin } from '../src/lib/janus/StreamMaskPlugin'
import { WhiteBoardPlugin } from '../src/lib/janus/WhiteBoardPlugin'
//import UA from 'jssip/lib/UA'
//import JsSIP from 'jssip/lib/JsSIP'

const base64Image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABGYAAAFTCAIAAAD0pJ0dAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAAEnQAABJ0Ad5mH3gAADokSURBVHhe7d1roqQ4km3hHFcMKMcTo8nJ9GCqkbQNzPQA3I9DCI/1/bnJ1hMOyKXKvlX//A8AAAAAMMCRCQAAAACGODIBAAAAwBBHJgAAAAAY4sgEAAAAAEMcmQAAAABgiCMTAAAAAAxxZAIAAACAIY5MAAAAADDEkQkAAAAAhjgyAQAAAMAQRyYAAAAAGOLIBAAAAABDHJkAAAAAYIgjEwAAAAAMcWQCAAAAgCGOTAAAAAAwxJEJAAAAAIY4MgEAAADAEEcmAAAAABjiyAQAAAAAQxyZAAAAAGCIIxMAAAAADHFkAgAAAIAhjkwAAAAAMMSRCQAAAACGODIBAAAAwBBHJgAAAAAY4sgEAAAAAEMcmQAAAABgiCMTAAAAAAxxZAIAAACAIY5MAAAAADDEkQkAAAAAhjgyAQAAAMAQRyYAAAAAGOLIBAAAAABDHJkAAAAAYIgjEwAAAAAMcWQCAAAAgCGOTAAAAAAwxJEJAAAAAIY4MgEAAADAEEcmAAAAABjiyAQAAAAAQxyZAAAAAGCIIxMAAAAADHFkAgAAAIAhjkwAAAAAMMSRCQAAAACGODIBAAAAwBBHJgAAAAAY4sgEAAAAAEMcmQAAAABgiCMTAAAAAAxxZAIAAACAIY5MAAAAADDEkQkAAAAAhjgyAQAAAMAQRyYAAAAAGOLIBAAAAABDHJkAAAAAYIgjEwAAAAAMcWQCAAAAgCGOTAAAAAAwxJEJAAAAAIY4MgEAAADAEEcmAAAAABjiyAQAAAAAQxyZAAAAAGCIIxMAAAAADHFkAgAAAIAhjkwAAAAAMMSRCQAAAACGODIBAAAAwBBHJgAAAAAY4sgEYF7/APgZfUsAgB9gMQUwL236ALxL3xIA4AdYTAHMS5s+AO/StwQA+AEWUwDz0qYPwLv0LQEAfoDFFMC8tOkD8C59SwCAH2AxBTAvbfqMUgBj+lqMUgDAD7CYApiXNn1GKYAxfS1G6S00JAC8S6vJfNiCAJiXVlCjFMCYvhaj9BYaEgDepdVkPmxBAMxLK6hRCmBMX4tRegsNCQDv0moyH7YgAOalFdQoBTCmr8UovYWGBIB3aTWZD1sQAPPSCmqUAhjT12KU3kJDAsC7tJrMhy0IgHlpBTVKAYzpazFKb6EhjVIAGNN6YZTOhxUNwLy0ghqlAMb0tRilt9CQRikAjGm9MErnw4oGYF5aQY1SAGP6WozSW2hIoxQAxrReGKXzYUUDMC+toEbpdf77959/fv3+P10BT6SvxSi9hYY0SgFgTOuFUTofVjQA89IKapS+Lx2JnOZ0dHhkyh1wqMLMysu9UnoLDWmUAsCY1gujdD6PXNH0UIHvovcbjh6NUfqeclz69z9d/u9///f7V5VwZMIXSG+1o/QWGtIoBYAxrRdG6XweuaLpoQLfRe83HD0ao/QN5XjkT0dZHR8emT4jH7yayURn6gAdy4vjKb2FhjRKAWBM64VROp9Hrmh6qMB30fsNR4/GKH1dPhp1z0LxZMKRCc+XPhVH6S00pFEKAGNaL4zS+TxyRdNDBb6L3m84ejRG6cvGJ6bq3zPZkSmfVyQcWzo9+brNGacpLOM5nWl16+Seqso5K0Omf0z/5AesJ9POBt9If2Cj9BYa0igFgDGtF0bpfB65oumhAt9F7zccPRqj9GXuaNEIZXamWI8mJdiaVkemeOAqtbfSeJnqqmYYc6CpUw298FXyPyfWpJrawVTxRdJr4Ci9hYY0SgFgTOuFUTqfR65oeqhGKfA0eoONUjh6NEbpy/aOKOHs0DlIxCieW9p+U6Li9oizatu12jp1h6FGvoijhajtLiX96eHZlr+0p/QWGtIoBYAxrRdG6XweuaLpoRqlwNPoDTZK4ejRGKUva88Lm1DWO0aECuHY0uk2l+do58S0Ox8z6nztMs41XhWui1FvB5PAEy1/ak/pLTSkUQoAY1ovjNL5PHJF00M1SoGn0RtslMLRozFKX7ZzfNk7hhThtBGq55KOXHlnzN4BptGrk/vsd38w892p4rvob2uU3kJDGqUAMKb1wiidzyNXND1UoxR4Gr3BRikcPRqj9HXjM0osOTh49I5Mo0PHFUemLW16TwVHR6aDEfEllj+1p/QWGtIoBYAxrRdG6XweuaLpoRqlwNPoDTZK4ejRGKVvyEeG9gDT+3c1VbV42AgN9k5Fu6eUMweYQZ0S/25Gzvl45vtTxVdZ/uye0ltoSKMUAMa0Xhil83nkiqaHapQCT6M32CiFo0djlL4lHxrCqSEfKeKppESuWn0SqY4epVPXRQrssi5c+nrhADOqY1OMEz8589FU8U3yi7BRegsNaZQCwJjWC6N0Po9c0fRQjVLgafQGG6Vw9GiM0reVY8OmOTGkc8YS+nrx1NI5yKxnmCx2GQeszitF51QkgzqKq7mnWSzV/IBtz3tTxdfQ39covYWGNEoBYEzrhVE6n0euaHqoRinwNHqDjVI4ejRG6R+UjyTjU84t8sGnPu/oyKQr/M3Kx7JSegsNaZQCwJjWC6N0Po9c0fRQjVLgafQGG6Vw9GiM0j+oe1y5V38KHJlg8reyUXoLDWmUAsCY1gujdD6PXNH0UI1S4Gn0BhulcPRojNI/Z4J/yTQ4tHFkgikfy0rpLTSkUQoAY1ovjNL5PHJF00M1SoGn0RtslMLRozFK/4h8VFnM+H+Vt+DIBFNe1JXSW2hIoxQAxrReGKXzeeSKpodqlAJPozfYKIWjR2OUAhjT12KU3kJDGqV9/r+qRP7s/8krgD9C379ROp9HbkH0UI1S4Gn0BhulcPRojFIAY/pajNJbaEijtKP8S1t3RBr961MA3y4tBo7S+TxyC6KHapQCT6M32CiFo0djlAIY09dilN5CQxqljfIvmMIBaZYjE0c34G5psXCUzueRWxA9VKP0Iyb7/w/w4em4/zsI/j89/MSn/i76YxilcPRojFIAY/pajNJbaEijtNH5r1HhyAT8rfJqsVE6n0duQfRQjdJT8mq4aba9h3vh3MFN5438q/KJpbv9Pxm/6Q5mUG7+8IZPVpPD9+Sc/LfYKIWjR2OUAhjT12KU3kJDGqWNst6GX7d4VKl+/fKlllz/z3bZr2lythn+qFb1Sj+933w31/SP6Z9yJM0AvnA8/N3Gs+rcVHgCnYecq66d2B/FPdFS1gSN5o9QbKNVFQbdFDsPPhSFslhiQuvdOTTt/ZPKLeOji1G+Gk4njrQIpa5f5Z2Rkqqb3du5hUY2SufzyC2IHqpReqi8Qu5l0GtSv5zxHavkTnZrfEzz5bxJn84f+AqmUP7Kh3+yk9XM4YtySv7DbJTC0aMxSgGM6WsxSm+hIY3Sjub3OAfrdfz5C2W5aFt9qx/KqlRtXVBf1+I8Fk2PoUr+5yRMr57Qdn00/E32Z2U3ZUn3nuJN+GdiDbak9P9rCUOw+xg6g7TtdvtZCvt3mLoed5Ivt5ttgqp699pdxvvo3FWngg2WLwZX3WvrJhelB+6HKvWTrc3x7dwiz2qjdD6P3ILooRql++p3S+q4etevkt/JZjJRntpBnRPKl3Pz6/8X+Mibkl5fRykcPRqj9F03fd/HpplIY96Z4TR9LUbpLTSkUTqwbeHM+osXfv/iD2b1m1b9UlalsWmRs+FL3raouow1Op2FqO0uJf3Rc92O0vwnpbWDWfWLt6R+IotOBd9DP+g/BjkcpMjZbkdFr62JQzU1Q3A8h3TlJ5R7txadu4qRr133FKv2ZmJK2W8/snrO2dZpr5OcxTlebRnQUzqfR+7S9FCN0l2d11TiC5OubnhTem9pZTzjl3yoG9Q+8mDz+7tRCkePxih9T/nF2P3s7jH1V3nTGogL6WsxSm+hIY3SrvwZbO9a/FV0H2v9c1l9PtVnHUv7P7W7P8CdwrbPbfh4VbguRr2NRr/H0azam4qPIF5lscumQtuiHaPSb9I+uX5ayZ0Na8Whmg59cGIO6cLNO7Zo76qK8lWp3hkrR6Vup3SjObjOLIrt+p3sdn2JZTxP6XweuUvTQzVK93TeUpOLwvuzvlQSXpxOT75u85Y1hWU8pz+t+M42jYq1aRglzCGV1DfUjtj0Hwbu3O4atRVyEh5DnF1VWAl1fcXOTLYo/1OrVM9d5q5OVsvqSVdj9+7zderaKIWjR2OUvuUTf7GP2F7cKaVXf97Z4QR9LUbpLTSkUdqTl1j3osUV2C/W1dtYfT/Vdx1Lq2Vd+qn0CstscliNnqtXE/Rd5H/sGI1+j6NZtTcVb7t+CAt3z4umQtuiHaPSb9I+uX4qubCIg+Xeg7W86dAHJ+bgxhRXvx23WEevKlSPyD2UdphtnFwtXa3/kKvnhq6LU7dzizz9jdL5PHKXpodqlO7ZewFCWb5YrK9pCbam4W3T5Vaca2+l8TLVVc0wZlc1junEKXJJO2a21ajvKEmZ1Qhza8YrrasBfIWSrN2XCayXofNar+7OQCej3pgnqqVLV6PToqrxjmVETykcPRqj9B35Txjeg86bcYfe2zeVD7zZ+KPKx7JSegsNaZS28lcQvr74ObrPta5afUCuZhJL+9/47pe/36QavBTUX4vrYneoWq7c4brqOFNaOZpVKo83Fe+7eQp1l02FtkU7RqXfpJ320c0UuTerlpu4ruNQTYc+ODGHdOHnnQstaO+qivJV6aozlos6pautzLpLicbwDfud7HV9jWU8T+l8HrlL00M1SvfsvQC5zF7XcFHE6ODTyomKO5+GadvVBjV2+jShSr6o+9mddSyN45XekhiFCeVk7b0aa3Bb2f602oFORr0xT1TzYyfxtpJOv69aOvCUwtGjMUrf0Pmbf+Av+Ib2TZpN7/PYkR7j1Pfz9ykfy0rpLTSkUdrI79jegho+k/hGVu9nqNmU9j7y/Q9/UFri6v8jyCLn8WvxPVTTmcTRrNIdxOKjx5rLt6QZoB2xHaPSmWQz7KKX9bgZ9me/DtUUh+B4DukqzNt337mrGOWr0ldbNyTNOCtfrfT371LXJuhGOHM7t1gG9JTO55G7ND1Uo3TP3hsQynrvYKjQvLFVt9vLGGpW9uZTDGrsdSqhSr9+3fk26cXwdnPBr9//hS7bAUJn5Wq73LnxTpHvqh3oZDTseL9aunQ1Op10olctHXhK4ejRGKVviH+u/AZ46W+dq4xfi/SP6Z9yJM3f3xd23448cl0wbtUZNMyw8yrnqmsnNp6741LWBJvuHIe2qVXPrivc6ioM5maWtGVbki/dsLH30DIUqSRn4794Epq1I8XG68zDyPt3dAWNY5TeQkMapbXyQOJziA8+/qFD/XyxPfhYsy6NTRf1daPuwKxvQmxr8doiBzsTyMHO+PfYn1W6h/gI6qcS7rJ05vurq7dBZ4xK28RG2qZdXwdLYb9m1Up/wnWofO37jMHhHOo7y80tyLXjXcUoX1lvoWnTNpfGmZTS0Ee+8PViN6U4dBKu75FnuFE6n0fu0vRQjdI98RUJYlH9rif5tQxvn9UoL2wrV94ZM3bZNajR7zSngVXp1687T9drpVC4tV/j2GU7QE7CzHNTp72tpK5lVDt32xFvrp1OdUPFiWrtdOppd/p9Vel4pRSOHo1R+rpTb0ZbyVdZXwlrUt7JrYPqOtevhuy8NfutbFBLumPGQeIQpcGWlP4P/tt+U1bPfJ/Nc7HfMM5uUQX1dKrrfDtr7dA2FQ0bLlexVSlpH5/vsjy7bW7LtdUtDWf97/DNc9govYWGNEor9YPN/JNXFVfDlW6Ped/2jHPj1eGz3wYIVRV3pr1U85NqB4gTqHr4Y8az0k3pKsn313sc2dI2X659NNXb9u0YlbZJEad93MXK36EvWbpIl2tPeYD6cYRgfw6xMHFtO3cVo3zlGoTewiQSfx9bcWqzjVHq1F36rnZv5xYa2iidzyN3aXqoRumu5hVZxZL4phWhRni5x70u4mcQ7TbMBjU6neaaLopVev3UnaTr7TK0UFX/b5Zi67ovJX5E3+HgtpKdoqQd6GTU6/hEtXTpa+Ti0ORgwmcsHXhK4ejRGKWv6/212qx+MUKN9hWIUdtdSjoNmjo7rY4adF7lTgXfQz84muZJpfMkdrhpug5Bb+CcWXd5gL3am859iWtXV/Jd7nVfymb97/BduveU3kJDGqW3S3+Ljz/h7guRwiv/lsBfoCwXK6XzeeQuTQ/VKN03+JHq/mDGanGZDA3q1lF3fS12imTQdRs3XcUq+SoOVfeRrt1l6LA0T2KPg6skJ9uAcX47N972FHSKz0W9MU9US5ehRt0mXw/u5aylA08pHD0ao/R1vTfv8M2IL0HzSixcF6PefNTWOWrVDhqnGK+y2GVToW3RjtGZ1UvyGP0Omq590B/Xp7nn8s9Hk+w8mixOLtZKfdrFbv+q6Kaztg3t+p3sdv0BS++e0ltoSKP0dukP0/nb/8j4b/npkYC/TFkuVkrn88hdmh6qUXqk/FD6tS2vgHEJLJGrlgPXKP7AVr++ixTYZV249KWLqpeePHCYW9I2rAbRDdQz3irUPeRrP04YuDQOFWIHdXd1h9Vt9O9KymDVUHbZDnQy6o15olq69DVysQ96fbxq6dJTCkePxih9Xe/N62X5z1rC+i9cvxKJ6yL/Y4cboNPDUau2SZxW5zV0c1o0FdoW7RixCy/ON7ZabMVNkTRd+6A/rk/z7KUdwpcWrs42t9CytMndx0fj6pt1arlmulr/IVfPbUMvx3d0hTzZjdJbaEij9Hbpj+D/yh8w+KOtf3cA7yrLxUrpfB65S9NDNUrPyD9mTvenbAl9vbgahp/DIq+kq9hlHNCVbQWD1bYz0KKb+kGWsnQZq/gKYRZ56lV34YehM16MYtfRv/81zUPnPcOHeTiTrBP1xjxRLU4kOe7iZerZKIWjR2OUvq735vWyLW3+wqmg/ou7Lvq9eQcddLVt4rw672HssqnQtmjHOJpVI3cqsata07UP+uP6NA9U/rmMudXO1dzg7Y1Kt+FyWTXoT6bYymxCKVFb37DfyV7Xn7D07im9hYY0Sr/A6G/m/vAA3lOWi5XS+TxyRdNDNUrvMfwZ/rj7RrpC+h25cEvw531k01Ne4JVSOHo0Runrep/T4G9Y4o//twn3y49apRFicdWiuYlcviXNAO2IzRhVFwfyDLI40b5mviFoShchy1MLFzZo07S9UVPfX2na/MVT3L8l33WZ0Vz/Hb5L957SW2hIoxQAxrReGKXzeeSKpodqlN7j8h+7TfjhfZr0nJ469zM+8x7k93ejFI4ejVH6hs5fzG98vVw1idUtXlvkwLXP/flGKbDL0WD7rfIYsVXdUZhF6cz314zbBO0YbZU9qbmb/oE8XV89BuUGtvLudbd2VTN3u97FUjjuc60cQ4tDw9Jf7sHy0p2rl4P18dWj1ddXyPPZKL2FhjRKAWBM64VROp9Hrmh6qEbpLeKP4cXyYNf+tF4mbTYeOvUz0u194DXQG2yUwtGjMUrf0P10y/Y1CSWKqxdYf/StTe8dWDffWbVRHr4yo1a9N63tyc9oaZsv1z6a6m37eoy2xgflW63vMATV04gTiTdXtc6FsjRLl2trX1aNt1BpHY+axSdW6owmlezd0RU0kFF6Cw1plALAmNYLo3Q+j1zR9FCN0qvZr971v3eb+MuMWXzq71LeqJVSOHo0Ruk78sb25F+t2fMmP/mr58HbDfmcunf/5b7rntOn4ii9hYY0SgFgTOuFUTqfR65oeqhGKfA0eoONUjh6NEbpW84fW/r75x8cmTgxTe7L7jl9Ko7SW2hIoxQAxrReGKXzeeSKpodqlAJPozfYKIWjR2OUvufswWWwf37/yPSoDfn7t/lcX3Zi+pMLi4Y0SgFgTOuFUTqfR65oeqhGKfA0eoONUjh6NEbpu04dB0b757/jLMGJ6Qvkb2Wj9BYa0ii9Qv5PQIq/7YUFvoy+ZKN0Po/cpemhGqXA0+gNNkrh6NEYpQDG9LUYpbfQkEbpJ7mjkjzhxJSP5d43HdHPav90i7/xQaCml8Eonc8jtyB6qEYp8DR6g41SOHo0RimAMX0tRuktNKRR+jk6ejxunx3/TWY5O/x1/3Ls6/51Lj4lfdSO0vk8cguih2qUAk+jN9gohaNHY5QCGNPXYpTeQkMapZ+SjxqPPGnUp4VyaHrK8eFDZx2OTBhYXgxP6XweuQXRQzVKgafRG2yUwtGjMUoBjOlrMUpvoSGN0g957ompPS086l44MuFaabFwlM7nkVsQPVSjFHgavcFGKRw9GqMUwJi+FqP0FhrSKI3yv2BprMeHvLFe+R12KknVfI321FH+BY5jXXROKbmnNWor5GSbQnVZzXXvMJAr+gr1WKGntuYSWI217LhJ/n+LUtwETv9eXIvCP59+k0V/zvmqGdek0lToOm3/FiGpOrRBm5tsAsxGfx6jdD6P3ILooRqlwNPoDTZK4ejRGKUAxvS1GKW30JBGaV9nD5yi+hyxXq87361G2V7HfXDKrEbYUzfjldbVAL5CSbbuw2WZTv+qESayCEOlCzdsrrtdl55j8xeblOJfSxiCrX1psA5QF+drP/xit0l3zt1uNrl0YZ1UA5RrN6lF7LAetExp564xjfx32yidzyO3IHqoRinwNHqDjVI4ejRGKYAxfS1G6S00pFHa19kD10KVeg+dtdvwlFiTUBrHWzfYVRQmlJOtd3/ph8na1k6cZr6Ks/ZiT/lq2LH0mrj++8FaP84uiXfXlh806c85t4lcD/0etyROOetU8D0c3DXmsfydPKXzeeQWRA/VKAWeRm+wUQpHj8YoxXz6myT8CeVjWSm9hYY0SvtObGBDlX79eqeda9l1KPTtc8Gv3/+FLtsBQmfhsh52oT6r+RW5zBlUK+I82ll1HDRp+0gTsqBzL7nBGrUVDpq04yWdRo6fURF76fQZO2wqtC3aMTCF5e/oKZ3PI7cgeqhGKfA0eoONUjh6NEYp5pO3J2xHplA+lpXSW2hIo7SvswdelBfJsyr9+vU+POyKQ+HWfo1jl+0AOdk6z5ebai5t8009y1rV82JnVsUrTdo+/GPKk+tY59vO/qBJf877D8HPqIi9dPqMHb5415hIfnk2SufzyC2IHqpRCjyN3mCjFI4ejVEKYExfi1F6Cw1plPaN9sAuilV6W+66k3S9XYYWqur/zVJsXfelZBvRXXbm0pue2SsrhdU97M1q8WKTto/UgQW7k0vaCgdNunM+aORnVBzcVN3hi3eNiSx/R0/pfB65BdFDNUqBp9EbbJTC0aMxSgGM6WsxSm+hIY3Svv6ONuypO5vmuOeu+0jX7jJ0WJonscfBVZKTbUB3OagbEqe5M+fMXVf9vtqk7SP1YEFvhKCd/UGTfvHeQ4gzKqpe+je9Jc2g7SzaMTCF5e/oKZ3PI7cgeqjAd9H7DUePxih9V/7N9dyvZypLP76+TvPrXn6jV6G86TyLXexNYBGL16Y5rn7oc5ZrtPuCXlRU8ze5aqdRHLiZfBZnud1uU7s3H1xCT9wovYWGNEr72jeuvJ/xlQpVqgp1D/l6ewerl7I0DhViB3V3TYfhMve90zaovo4gN90K67vu9fxqk7aP1GQLqv5KsF22zQ+a9BrsP4R6RkndS25v12V832EzaDuLdgxMofwpV0rn88hdmh4q8F30fsPRozFK3+V/MLs/x0n41fc/8OEHe1Fd50u/H2iCEg0mkC5Hnfd/+tV3W9iLKmca5TFc1NxPDKridOl6O54SPib92Rylt9CQRmlf953IoSxl6TJW8RXC+5hfwKq78FJ2xotR7DrKneQK9ZDG5a3q66j5keu7jnNcvdSk7aP6PhfhZuq5bqP5RsMm7XjJ1omz1mpn1Pbie1iGy5frsE31tn07Bqagv6lROp9H7tL0UIHvovcbjh6NUfqm8ANb/5zmX//4axqifFHtI/YrtC12J1AJxd3JqqNOPwddLw4b5atsjQ5usCpOl36A3KFvjcukP5uj9BYa0ih9uPQu8+oCl9F6YZTO55Ermh4q8F30fsPRozFK3xR28fWhod7iJ+4U4P7R8WlTo22SkuEEKp0TzHp11M9B14uDRnnq9X8F88ENVsVhjp3GuM7yqD2lt9CQRunDpZeXdxe4jNYLo3Q+j1zR9FCB76L3G44ejVH6nnwmWHc+9aGh2uJnbp/f3/L7tKnRBPsTUBJsxaUsN64atq2K+maCdnAXrROPtQ5usCrOl4FviivpgRult9CQRunDpXeZtxe4jNYLo3Q+7NIAzEsrqFH6lrz/3zY+9aEhbYvqU4Y7BVQHAvFpU6MO9ieQa7sJ1PNbu6sLmordqDJuNP6vYD64wao4XfoBcvHunPApy5P2lN5CQxqlADCm9cIonQ8rGoB5aQU1St+Rt/9uw18fGjpb+nAIqE4E2X6FKtifQNO6np9V+V3nbcVeVBk1ytY81jq4wao4XYYBjieFD0l/REfpLTSkUQoAY1ovjNL5sKIBmJdWUKP0DYc7+LzjX8QTgqtQjhTbmaC+ro4MdXAwgao3zSY0sDCO0tzIohNVRo1i57HWiRt0xenSD5CLd+eET1metKf0FhrSKAWAMa0XRul8WNEAzEsrqFH6Ip0FRso+Xlt8Ozgk7QY/7/tXsbw6MrjA99mjfqqh02U1A9Xwg9TnmqwTVc41itH4BjtX5TKI08Z19MCN0ltoSKMUAMa0Xhil82FFAzAvraBG6YvSxn+wX08b+3Im2P7p4/LJ43ACZ1THEqCnfCwrpbfQkEYpAIxpvTBK58OKBmBeWkGN0hd9zZGJExPOKB/LSuktNKRRCgBjWi+M0vmwogGYl1ZQo/RF33Jk4sSEU8rHslJ6Cw1plALAmNYLo3Q+rGgA5qUV1Ci9woVHpg/hxIRzyseyUnoLDWmUAsCY1gujdD6saADmpRXUKAUwpq/FKL2FhjRKAWBM64VROh9WNADz0gpqlAIY09dilN5CQxqlADCm9cIonQ8rGoB5aQU1SgGM6WsxSm+hIY1SABjTemGUzocVDcC8tIIapQDG9LUYpbfQkEYpAIxpvTBK58OKBmBeWkGNUgBj+lqM0ltoSKMUAMa0Xhil82FFAzAvraBGKYAxfS1G6S00pFEKAGNaL4zS+bCiAZiXVlCjFMCYvhaj9BYa0igFgDGtF0bpfFjRAMxLK6hRCmBMX4tRegsNaZQCwJjWC6N0PqxoAOalFdQoBTCmr8UovYWGNEoBYEzrhVE6H1Y0APPSCmqUAhjT12KU3kJDGqUAMKb1wiidDysagHlpBTVKAYzpazFKb6EhjVIAGNN6YZTOhxUNwLy0ghqlAMb0tRilt9CQRikAjGm9MErnw4oGYF5aQY1SAGP6WozSW2hIoxQAxrReGKXzYUUDMC+toEYpgDF9LUbpLTSkUQoAY1ovjNL5sKIBmJdWUKMUwJi+FqP0FhrSKAWAMa0XRul8WNEAzEsrqFEKYExfi1F6Cw1plALAmNYLo3Q+rGgA5qUV1CgFMKavxSi9hYYEgHdpNZkPWxAA89IKapQCGNPXYpTeQkMCwLu0msyHLQiAeWkFNUoBjOlrMUpvoSEB4F1aTebDFgTAvLSCGqUAxvS1GKW30JAA8C6tJvNhCwJgXlpBjVIAY/pajNJbaEgAeJdWk/mwBQEwL62gRimAMX0tRikA4AdYTAHMS5s+oxTAmL4WoxQA8AMspgDmpU2fUQpgTF+LUQoA+AEWUwDz0qbPKAUwpq/FKAUA/ACLKYB5adNnlAIY09dilAIAfoDFFMC8tOkzSgGM6WsxSgEAP8BiCmBe2vQZpQDG9LUYpQCAH2AxBTAvbfqMUgBj+lqMUgDAD7CYApiXNn1GKYAxfS1GKQDgB1hMAcxLmz6jFMCYvhajFADwAyymAOalTZ9RCmBMX4tRCgD4ARZTAPPSps8oBTCmr8UoBQD8AIspgHlp02eUAhjT12KUAgB+gMUUwLy06TNKAYzpazFKAQA/wGIKYF7a9BmlAMb0tRilAIAfYDEFMC9t+oxSAGP6WoxSAMAPsJgCmJc2fUYpgDF9LUYpAOAHWEwBzEubPqMUwJi+FqMUAPADLKYA5qVNn1EKYExfi1EKAPgBFlMA89Kmzyh9xX///vPPr9//p6u5fHhu//f7l57TtHeMO+glMEoBAD/AYgpgXtr0GaXn5VPEv//pKknHFPPWwaIcTD5zJvnMmckdlWTr85Oz/UO+4BZult+BjVIAwA+wmAKYlzZ9Rulp1YmpbL7X63QZjlOnfHQH/4Ezk86Agxv5gvPGF9zCzfILsVEKAPgBFlMA89Kmzyg9K2+2t7NEPlwMt9659PUT1A/99MyUb5HjBLz8rWyUAgB+gMUUwLy06TNKT6qPE/uHoj9zZPrhkYcTE1r5W9koBQD8AIspgHlp02eUnlQfgvL5oncsUsFGh5CcL9VzR4vSsuo2XaYrq7SozzBN/66KjfGeNGjqyg1ejV7NNmmmY8Wduia3cT1XVevihZ/S3g12mlaRG6up3E45V9nslbme9lpVmjl0o7O3fwWNapQCAH6AxRTAvLTpM0rPGW1ts3YT226+t+ohrira3thGKo228jCNunCR2sdZnrdOcOugTKeaXhgwjBiKO3VNuItFVbUqrm4zVx7dY93zoorcWE3lah71SNV1Z6zkoFXleML58uTtX2EZzlMKAPgBFlMA89Kmzyg9J+9Ut920KfvZLGxjO9VL1XqzW1Vs24Uk9+GKU+HRuKdVe/Midtjp3k8hFO9MJY/k5l1VjcVtP37ISt3zoopcd03lMFQ7rjJr0RnrRKvK4YTbDlMy6O0Ky/CeUgDAD7CYApiXNn1G6Tm9rfAqb3IX20a2U727w64rttvh0CxfuG6b6rvTPHBigm33YUZtXW/ruh6p6jYUt0M2T8Hp3EMV+f7SP/vKdVk7iE87Y51oVTmacKdpLu/3doVlfE8pAOAHWEwBzEubPqP0nJ1db5ErrDVGO91qh91UTJc7G+h41elxPM0yP9PMY3Figm33YcI7dXPnVrMeqeo2FOeyjjCLVRmmtQ3mx6rmURqrrJqT7LTOjltVjiacm3b0e7uCBjRKAQA/wGIKYF7a9Bml5+zseiXU6FTv7bCbiuky1gnN6g32UXev6TWOs25qpOJtEqG4rpuvS936UVRVQ3Ez5K6650UVVf3lS/n1a6lpZf1xfdoZ60SrytGEd5reZBnfU3oNjQEAH6UlZiYcmQDMS2unUXpOb38cxAqdnW6/h6piuhxvoPM/7+2fc4W3d9id1tWk69tKxW66obium69L5arXumooruvu69Suonpa3u78k5B1Z3bYqnI04e4gt1rm7im9hsYAgI/SEjMTjkwA5qW10yg9qdr3pku3C86lLjjaCa863e40K8MEofZPN9i5/Tadprs421zsHkIs7tS1y7rfWLUuDk2TFLhLr+55UUXVWMHOlBfd6zjW4qhVpdNJFTUdpGDY3+ctg3tKr6ExAOCjtMTMhCMTgHlp7TRKT2r3tnmDvar3zmWn60raDpJqB58uY52q2VLBb5dz87W0P8Rrtnkn1dbczTaOXLjiuqNQty7qiV3nnlfVrJzOE6iiMMdKWxbH3e3Y2WtVOZ5wcvb2r6BBjdJraAwA+CgtMTPhyARgXlo7jdKzxjvk26QpVDPIs7I99N5xAHhL+VhWSq+hMQDgo7TEzIQjE4B5ae00Sk8Lp5M/oTcBf0rixITPy9/KRuk1NIZRCgAv0iJilM6EBQ7AvLR2GqXn/fEzU/m/z3IzyIH9e6d08Wf/LRi+UHrlHKXX0BhGKQC8SIuIUToTFjgA89LaaZS+4s+fSsqpabOdnzgx4Qp60YzSa2gMoxQAXqRFxCidCQscgHlp7TRKAYzpazFKr6ExjFIAeJEWEaN0JixwAOaltdMoBTCmr8UovYbGMEoB4EVaRIzSmbDAAZiX1k6jFMCYvhaj9BoawygFgBdpETFKZ8ICB2BeWjuNUgBj+lqM0mtoDKMUAF6kRcQonQkLHIB5ae00SgGM6WsxSq+hMYxSAHiRFhGjdCYscADmpbXTKAUwpq/FKL2GxjBKAeBFWkSM0pmwwAGYl9ZOo/SPyP8TTwX/xeCYmV5To/QaGsMo/VP4r+3H1/vel1yLiFE6E45MAOaltdMovZU7Kgl7MkxN76lReg2NYZQeqv/Hyk7+D05XzZov8XA3mTu45ANu7uhP/i9o48EmfskvVm54pXQmHJkAzEtrp1F6I/18sf3Bc+RXdqP0GhrDKD2Uv6vtqyr/ucT+Lq98iu5L1H+Y4b/NP7ibjHd05oaA2uQv+cXSnTpKZ8KRCcC8tHYapbfJv1fse/As+lqM0mtoDKP0UDxgLA4+tbJz9A2yOj7cTX5GM/tFnQ1mPKneHeFm87/kF1sG9JTOhCMTgHlp7TRK75J/qzgx4WH0tRil19AYRumhZj+2f8IYf4mxoz+4m+zf0VNWj94d4V4PeMkvtgzoKZ0JRyYA89LaaZSelNb8tOTntV+an4CyVVuFcvtt8h2E36rOj1yu6yK1jZXWQavp7E0GOEmvj1F6DY1hlB7Kn4V/v+vvJhhvJvXJWE+pl1RPX10WvqLRF2vqT64prD7RrbNc0zevhwpdtTWXwGqsZcdN3HRKcRM4zc1krkXhH0+/yWI451roIT75aDRUL8+jd/6MMWruzHq1yUvdWxhxfGfdabTR2d46nZlctDZNHaZ6vuPQbaenMIl6Dk1hGc/pT6u6tcWg3lnqxSidCUcmAPPS2mmUnrQu6PYTEX95FrmGW+bj9frDsdUoXa49NL9NGnKLSo1fv0Kt7RfJ/3jtTwY4K79aG6XX0BhG6aH8cm9vf/NlRlXtIJTli8X62ZSgGqj6PLfiXHsrjZeprmqGMaXOwkjpYuu3HqfMIjZ/sUkpXtaZGGztS4N1gLo4X/vhF7tNunOuVT2kazem13ZeWg3y3LHvKteLUQktyRVsJrn5Oq2myPUSx68106ijV3oL06iEsnyxWDsqwda0mla+rG53K42Xqa5qhjH7UhV3O9W4r1sG9JTOhCMTgHlp7TRKT6p+G5IQ9X4TfIXqp6YIjeJvRKmfbIOW6r9TydpRrleyuuJ4MsBZ6RV0lF5DYxilh/KrXanefqf3cZjwkXS+mBjFL7btNyUqjlWDtl2d5avxHfUWjv5Qq14T138/WOvv3qmuqunuNzkz506nfXGum1FeFZS5JLGun2+YS25gF/uzHE4h6RTu1t8t3ZtHLgu3EjuJURyl7TclKt6ZUNuu4TrKcm/7TXYtA3pKZ8KRCcC8tHYapSfVC3rifgf6Pwku7f+c+Ga+Rs5//f4vNkrpcuV/SxSFjuLFqp8Cu5aXxlN6DY1hlB5q3uz8hbgPJ9j7DprPqO4jVAjfdKfb7UMNNSu9+eTMGTQtYud7Q60OmrR9+Gexe6dJW+GgSTteo9ND36iv8Ri+JA/TLLwLP904GVdyNMnxHBadwt36u6V7Mwll6aLuo709q9HpNpfn6N35SDWTEy32Lc09pTPhyARgXlo7jdKTqgU9c6t6f4F3af/3xDfbaqxpbLT+OK3/kGvm8lDzcDLAWctL4ym9hsYwSg913uz8PfTf9vhRBbFo/bicMFT70XXkyjtjdr/LXuaV2/PWzkdDvdKk7cM/i907XSuE2R80Gc3Z6fTQfz67998dYytZJ77/AOIN5rrS9u9Li+4cFm3Nwtc/3Vt7A6tYFO5L2tuzGrmkI1feGTN22df2vV//iDoxSmfCkQnAvLR2GqUnHfy09H8SfNqrEX5kdOH/A8721630kPPln1Ki4qOhRimwa3lpPKXX0BhG6aHem52z+oMtxh9CLElXdQ+hRvg8x70u4occ9RrudpYLXWex8+5QLzZp+0gdWLA7uaStcNCkO+focFAz6ms8hkrGC+8iBdt1mEyuWy7yP7pZ5nqum6Zbr1MYo5d6Gz+vWJKu6j5CjTDKuNfF3nx2Gxb1THKT0e2dsLT2lM6EIxOAeWntNEpP6izg4Weg95sQsvyDEmvE35hSIYmRXfmL/M///rv0H7o/PRngpPxGbpReQ2MYpYdefd1zWfyWk/C1LTrVYq/Dz7O1M51e0U71tiyO3JvHq03aPlIPFvRGCNrZHzQ57HHhZ7CrHb0Y5WX0bO2/nlC6dpehq1w3XFjNZsS626BT+IPeSvW2tG7UqRYHCg1ODOlnuNkpMqlK6Hp/sEPLgJ7SmXBkAjAvrZ1G6Ul5zV+sS3gO3IKeF3j3q1BfN0n9i1CKQ5NQJV9YYVM59laKt57qa+Ck/JptlF5DYxilh5r9WHnd3bdVayuU7zt8Iec++e26+chSYJd14dKXLqpesuaOnKonzXLtoNfdq03aPlKTLaj6K8F22TY/aNJr0CizDqP0m9RDLQ3zxX7eTG6bUL5ypWUqFsRSP4j/50W5geF9xjGzEL3W26I08BVKm7WLRN1s1XLgGlXTqmZRArusC5e+dFH10pMGbia732TX0tpTOhOOTADmpbXTKD1JC3r5USja5Tyv8qvOcu+bV79dvV+VEMWflNKT6yGP7Xs8nAxwTO+PUXoNjWGUHopvenbidY/fYv01LlK3S+jr7XyeRZxK5wNfubKtwDprPuaomlK6XKfRmVTyUpO2jzSh2OnenbrRfKNhk3a8vq3bZPx8hhW7eWd0F+VJV3MLf55c182lLZSlk3Q5us/9aWQv9Ca+ReLmWaTZLmHVswqTeg6L4d9xEQd0ZVvBYMqx16SZ7EvUiVE6E45MAOaltdMoPSkt6Ac/T8D30ddilF5DYxil0+rsJoHv8tiXXIuIUToTjkwA5qW10yg9iSMT/kr6WozSa2gMo3Ra+T8X/9l/FA7M7bEveV5CNkpnwpEJwLy0dhqlJ3Fkwl9JX4tReg2NYZTOin/JhK/33Jdci4hROhOOTADmpbXTKD2JIxP+SvpajNJraAyjdEL5P3pfsCLgaz38JS+TXymdCUcmAPPS2mmUAhjT12KUXkNjGKUA8CItIkbpTFjgAMxLa6dRCmBMX4tReg2NYZQCwIu0iBilM2GBAzAvrZ1GKYAxfS1G6TU0hlEKAC/SImKUzoQFDsC8tHYapQDG9LUYpdfQGEYpALxIi4hROhMWOADz0tpplAIY09dilF5DYxilAPAiLSJG6UxY4ADMS2unUQpgTF+LUXoNjWGUAsCLtIgYpTNhgQMwL62dRimAMX0tRuk1NIZR+gL+p5Kehv/xBlxDi4hROhO2IADmpbXTKAUwpq/FKL2GxjBKXzA8MuWCj+3ND3qz/0Gb1b//qeTvUz2L5pkdHplyB5/6w+HvUV64ldKZsAUBMC+tnUYpgDF9LUbpNTSGUfqCiY5M6zHps0M/STkuufNieRThBMmRCddIb5qjdCZsQQDMS2unUQpgTF+LUXoNjWGUvmB4ZLpVPDLZSeEp/6qpnv2bBjddx4dHps/40E3hOZY/uKd0JmxBAMxLa6dRCmBMX4tReg2NYZS+YM4j0yTTOukzp4vxLcf+OTLhGssf3FM6E7YgAOaltdMoBTCmr8UovYbGMEpPKf/2wosb5M6euWnSaeG5nf3+Drwprc8Pseum5hJYjbXsuIm7nVLcBE7obi11LQp/mOk3WfTmnLP+UagMYh2kRqme79133utpOJOkKdy9KXwt/bWN0pmwBQEwL62dRimAMX0tRuk1NIZRemjbhG/767gx1046bq9tt27/vFNc79s71Z26NLROF3VP23WZdmz+YpNS/GsJQ7C1Lw3WAerifO2HX+w26c2514kJZflisfZWgq1p7r2+28FMqstUVzXDmPgbLH9wT+lM2IIAmJfWTqMUwJi+FqP0GhrDKD3g99Rhfx22yZ09c4q6dbPclSWh38X+DjyW5qtx5dh1vvIj9fSauP77wVq/nXtKtiE797bfpDfnTierXGbVw0URoxcmH6sGbTt8ueUP7imdCVsQAPPS2mmUAhjT12KUXkNjGKX7wj55vL9u98y5riW7W/F2M76/A8+lTn8XL7HreqCugyZtH/5eOlPPDdaorXDQpB2v22QVytJF1TZWCL3vzqQ3D7M3H3yl5Q/uKZ0JWxAA89LaaZQCGNPXYpReQ2MYpfv85r3aNft9crtnTkm3aha6bXbj+zvw/VL1Fqxd1wOZV5q0ffhbzZPrWOfbzv6gSW/Oo/tYxCI/NRNmEKrvzmRnzM5N4cuVN2OldCZsQQDMS2sngHfpW7qGxjBK94WN8ng73uyZU9Vtf10X546263o3vr8D3y3Nha6r2HU9UPZik7aP1IEF+1NftBUOmozn3G0TS9LVbtvQ++5MuvOQ3Yb4Rssf3FM6E45MAOaltRPAu/QtXUNjGKUH8m5YO+Vmf73uoOs9c6rpttdVce6nqr1TvbJX2pTFruuBklebtH2kHizojRC0sz9o0i/O3bSN6sqdanECocH+TNqZr3aK8J2WP7indCYcmQDMS2sngHfpW7qGxjBKD+X9cN4Qb1vq/E9uk9zZh/sddCxOV2FjXm/V93fge6XVvHJV13U9UPJqk7aPeD9VfyXYLtvmB016DZLSyBeUqbtu1rvZquXANap6P56JK1z60kXVC75feqscpTPhyARgXlo7AbxL39I1NIZReoptvTdhZ17KS1RvypO1uOy6x0o711vHfmkYYukuXa6zGWztX2rS9pEmFDvNU1xVc91G842GTdrxNltXRfNUUq9L6OvFrjq9700+DljPMhtMFd9Ff22jdCYcmQDMS2sngHfpW7qGxjBKX9DZX78o99Bs7Iv25IHL/fxPir+SFhGjdCYcmQAAwDu0uzFKX8CR6evkf6U0+IMAQ2UNWSmdCUcmAADwDu1ujNIXcGT6NvxLJrxHi4hROhOOTAAA4B3a3RilL2CD/UXs/8sSf0+8obw8K6Uz4cgEAADeod2NUQoAL9IiYpTOhAUOAAC8Q7sboxQAXqRFxCidCQscAAB4h3Y3RikAvEiLiFE6ExY4AADwDu1ujFIAeJEWEaN0JixwAADgHdrdGKUA8CItIkbpTFjgAADAO7S7MUoB4EVaRIzSmbDAAQCAd2h3Y5QCwIu0iBilM2GBAwAA79DuxigFgBdpETFKZ8ICBwAA3qHdjVEKAC/SImKUzoQFDgAAvEO7G6MUAF6kRcQonQkLHAAAeId2N0YpALxIi4hROhMWOAAA8A7tboxSAHiRFhGjdCYscAAA4B3a3RilAPAiLSJG6UxY4AAAwDu0uzFKAeBFWkSM0pmwwAEAgHdodwMAH6UlZiYcmQAAwDu0uwGAj9ISMxOOTAAA4B3a3QDAR2mJmQlHJgAA8A7tbgDgo7TEzIQjEwAAeId2NwDwUVpiZsKRCQAAAACGODIBAAAAwBBHJgAAAAAY4sgEAAAAAEMcmQAAAABgiCMTAAAAAAxxZAIAAACAIY5MAAAAADDEkQkAAAAAhjgyAQAAAMAQRyYAAAAAGOLIBAAAAABDHJkAAAAAYIgjEwAAAAAMcWQCAAAAgCGOTAAAAAAwxJEJAAAAAIY4MgEAAADAEEcmAAAAABjiyAQAAAAAQxyZAAAAAGCIIxMAAAAADHFkAgAAAIAhjkwAAAAAMMSRCQAAAACGODIBAAAAwBBHJgAAAAAY4sgEAAAAAEMcmQAAAABgiCMTAAAAAAxxZAIAAACAIY5MAAAAADDEkQkAAAAAhjgyAQAAAMAQRyYAAAAAGOLIBAAAAABDHJkAAAAAYIgjEwAAAAAMcWQCAAAAgCGOTAAAAAAwxJEJAAAAAIY4MgEAAADAEEcmAAAAABjiyAQAAAAAQxyZAAAAAGCIIxMAAAAADHFkAgAAAIAhjkwAAAAAMMSRCQAAAACGODIBAAAAwBBHJgAAAAAY4sgEAAAAAEMcmQAAAABgiCMTAAAAAAxxZAIAAACAIY5MAAAAADDEkQkAAAAAhjgyAQAAAMDA//73/yxXFiyRWR/0AAAAAElFTkSuQmCC'

let openSIPSJS = null
let msrpHistoryDb = null
let addCallToCurrentRoom = false
let audioInputDeviceId = null
let videoInputDeviceId = null
let audioOutputDeviceId = null
const isWhiteboardEnabled = false
let onHoldWhenAddCall = false

/* DOM Elements */

const loginToAppFormEl = document.getElementById('loginToAppForm')
const loginPageEl = document.getElementById('loginPage')
const webRTCPageEl = document.getElementById('webRTCPage')
const logoutButtonEl = document.getElementById('logoutButton')

const makeCallFormEl = document.getElementById('makeCallForm')
const videoCallFormEl = document.getElementById('videoCallForm')
const sendMessageFormEl = document.getElementById('sendMessageForm')
const callAddingIndicatorEl = document.getElementById('callAddingIndicator')

const microphoneEl = document.getElementById('microphoneEl') as HTMLSelectElement
const speakerEl = document.getElementById('speakerEl') as HTMLSelectElement

const muteWhenJoinInputEl = document.getElementById('muteWhenJoinInputEl') as HTMLInputElement
const DNDInputEl = document.getElementById('DNDInputEl') as HTMLInputElement
const muteContainerEl = document.getElementById('muteContainerEl') as HTMLElement

const addToCurrentRoomInputEl = document.getElementById('addToCurrentRoomInputEl') as HTMLInputElement
const onHoldWhenAddCallInputEl = document.getElementById('onHoldWhenAddCallInputEl') as HTMLInputElement

const inputLevelApplyButtonEl = document.getElementById('inputLevelApplyButton') as HTMLButtonElement
const outputLevelApplyButtonEl = document.getElementById('outputLevelApplyButton') as HTMLButtonElement
const inputLevelEl = document.getElementById('inputLevel') as HTMLInputElement
const outputLevelEl = document.getElementById('outputLevel') as HTMLInputElement

const dtmfForm = document.getElementById('dtmfForm') as HTMLFormElement
const dtmfInputEl = document.getElementById('dtmfInput') as HTMLInputElement
const dtmfSendButtonEl = document.getElementById('dtmfSendButton') as HTMLButtonElement
const terminateJanusSessionButtonEl = document.getElementById('terminateJanusSessionButton') as HTMLButtonElement

const agentVoiceLevelContainerEl = document.getElementById('agentVoiceLevelContainer')

const activeCallsCounterEl = document.getElementById('activeCallsCounter')
const roomSelectEl = document.getElementById('roomSelect') as HTMLSelectElement

const roomsContainerEl = document.getElementById('roomsContainer')
const messagesContainerEl = document.getElementById('messagesContainer')

const audioChangeButtonEl = document.getElementById('audioChangeButton')
const videoChangeButtonEl = document.getElementById('videoChangeButton')

const microphoneVideoEl = document.getElementById('microphoneVideoEl') as HTMLSelectElement
const cameraVideoEl = document.getElementById('cameraVideoEl') as HTMLSelectElement
const speakerVideoEl = document.getElementById('speakerVideoEl') as HTMLSelectElement

const screenShareButtonEl = document.getElementById('screenShareButton')

const screenShareWhiteboardButtonEl = document.getElementById('screenShareWhiteboardButton')

const blurButtonEl = document.getElementById('blurButton')

const whiteboardButtonEl = document.getElementById('whiteboardButton')

/* UI Interaction */
function selectTab (evt, tab) {
    // Declare all variables
    let i

    // Get all elements with class="tabcontent" and hide them
    const tabcontent = document.getElementsByClassName('tabcontent')
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = 'none'
    }

    // Get all elements with class="tablinks" and remove the class "active"
    const tablinks = document.getElementsByClassName('tablinks')
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(' active', '')
    }

    // Show the current tab, and add an "active" class to the button that opened the tab
    document.getElementById(tab).style.display = 'block'
    evt.currentTarget.className += ' active'
}

/* Helpers */

const muteButtonEventListener = (event: MouseEvent) => {
    event.preventDefault()

    if (openSIPSJS.audio.isMuted) {
        openSIPSJS.audio.unmute()
    } else {
        openSIPSJS.audio.mute()
    }
}

const calculateDtmfButtonDisability = (sessions: { [key: string]: ICall }) => {
    const callsInActiveRoom = Object.values(sessions).filter((call) => call.roomId === openSIPSJS.audio.currentActiveRoomId)
    const dtmfTarget = dtmfInputEl.value

    if (callsInActiveRoom.length !== 1 || !dtmfTarget) {
        dtmfSendButtonEl.setAttribute('disabled', 'true')
    } else {
        dtmfSendButtonEl.removeAttribute('disabled')
    }
}

const calculateMuteButtonDisability = (sessions: { [key: string]: ICall }) => {
    if (!muteContainerEl) {
        return
    }

    if (!Object.keys(sessions).length) {
        muteContainerEl.querySelector('button').setAttribute('disabled', 'true')
    } else {
        muteContainerEl.querySelector('button').removeAttribute('disabled')
    }
}

const calculateAgentVolumeLevel = (sessions: { [key: string]: ICall }) => {
    const volumeContainer = document.getElementById('volume-level-agent-voice-level')

    if (!Object.keys(sessions).length && volumeContainer) {
        if (volumeContainer) {
            volumeContainer.remove()
        }
    }

    if (!volumeContainer) {
        const spanEl = document.createElement('span')
        spanEl.setAttribute('id', 'volume-level-agent-voice-level')
        spanEl.classList.add('volume-wrapper')

        const canvasEl = document.createElement('canvas')
        canvasEl.setAttribute('id', 'canvas-agent-voice-level')
        canvasEl.width = 20
        canvasEl.height = 20
        spanEl.appendChild(canvasEl)

        agentVoiceLevelContainerEl.appendChild(spanEl)
        //runIndicator()
    }
}

const calculateActiveCallsNumber = (sessions: { [key: string]: ICall | IMessage }) => {
    const counter = Object.keys(sessions).length
    activeCallsCounterEl.innerText = `${counter}`
}

function buildRoomElementID (roomId: number) {
    return `room-${roomId}`
}

function buildCallElementID (callId: string) {
    return `call-${callId}`
}

function buildCallTimerElementID (callId: string) {
    return `callTimer-${callId}`
}

const updateRoomListOptions = (roomList: { [key: number]: IRoom }) => {
    const currentSelectedRoom = openSIPSJS.audio.currentActiveRoomId

    roomSelectEl.querySelectorAll('option:not(.noData)').forEach(el => el.remove())

    roomsContainerEl.querySelectorAll('.roomWrapper').forEach(el => el.remove())

    Object.values(roomList).forEach((room) => {
        // Update room Select options
        const newOption = document.createElement('option') as HTMLOptionElement
        newOption.value = `${room.roomId}`
        newOption.text = `Room ${room.roomId}`
        newOption.setAttribute('key', `${room.roomId}`)

        if (room.roomId === currentSelectedRoom) {
            newOption.setAttribute('selected', '')
        }

        roomSelectEl.appendChild(newOption)

        // Update all call move to room select options

        // Update rooms list data
        const roomEl = document.createElement('div')
        roomEl.setAttribute('id', buildRoomElementID(room.roomId))
        roomEl.setAttribute('key', `${room.roomId}`)
        roomEl.classList.add('roomWrapper')

        const roomInfoEl = document.createElement('div')
        const roomNameEl = document.createElement('b')
        const roomDateEl = document.createElement('span')
        roomNameEl.innerText = `Room ${room.roomId} - `
        roomDateEl.innerText = `${room.started}`
        roomInfoEl.appendChild(roomNameEl)
        roomInfoEl.appendChild(roomDateEl)
        roomEl.appendChild(roomInfoEl)

        const breakEl = document.createElement('br')
        roomEl.appendChild(breakEl)

        const unorderedListEl = document.createElement('ul')
        roomEl.appendChild(unorderedListEl)

        roomsContainerEl.appendChild(roomEl)

        upsertRoomData(room, openSIPSJS.audio.getActiveCalls)
        //upsertRoomData(room, openSIPSJS.getActiveMessages)
    })
}

const upsertRoomData = (room: IRoom, sessions: {[p: string]: ICall}) => {
    const ulListEl = roomsContainerEl.querySelector(`#room-${room.roomId} ul`)
    ulListEl.querySelectorAll('li').forEach(el => el.remove())

    const activeCallsInRoom = Object.values(sessions).filter((call) => call.roomId === room.roomId)
    activeCallsInRoom.forEach((call, index) => {
        const listItemEl = document.createElement('li')
        listItemEl.setAttribute('key', `${index}`)
        listItemEl.setAttribute('id', buildCallElementID(call.id))

        const callIdListItem = document.createElement('div')
        callIdListItem.innerText = call._id

        const callTimerItem = document.createElement('span')
        callTimerItem.setAttribute('id', buildCallTimerElementID(call.id))
        callTimerItem.innerText = '00:00:00'

        listItemEl.appendChild(callIdListItem)
        listItemEl.appendChild(callTimerItem)

        const muteAgentButtonEl = document.createElement('button') as HTMLButtonElement
        muteAgentButtonEl.innerText = call.localMuted ? 'Unmute' : 'Mute'
        muteAgentButtonEl.addEventListener('click', (event) => {
            event.preventDefault()
            const isMuted = call.localMuted
            if (isMuted) {
                openSIPSJS.audio.unmuteCaller(call._id)
            } else {
                openSIPSJS.audio.muteCaller(call._id)
            }
            muteAgentButtonEl.innerText = !isMuted ? 'Unmute' : 'Mute'
        })
        listItemEl.appendChild(muteAgentButtonEl)


        const terminateButtonEl = document.createElement('button') as HTMLButtonElement
        terminateButtonEl.innerText = 'Hangup'
        terminateButtonEl.addEventListener('click', (event) => {
            event.preventDefault()
            openSIPSJS.audio.terminateCall(call._id)
        })
        listItemEl.appendChild(terminateButtonEl)

        const transferButtonEl = document.createElement('button') as HTMLButtonElement
        transferButtonEl.innerText = 'Transfer'
        transferButtonEl.addEventListener('click', (event) => {
            event.preventDefault()

            const target = prompt('Please enter target:')

            if (target !== null || target !== '') {
                openSIPSJS.audio.transferCall(call._id, target)
            }
        })
        listItemEl.appendChild(transferButtonEl)


        if (activeCallsInRoom.length === 2) {
            const mergeButtonEl = document.createElement('button') as HTMLButtonElement
            mergeButtonEl.innerText = `Merge ${room.roomId}`
            mergeButtonEl.addEventListener('click', (event) => {
                event.preventDefault()
                openSIPSJS.audio.mergeCall(room.roomId)
            })
            listItemEl.appendChild(mergeButtonEl)
        }


        const holdAgentButtonEl = document.createElement('button') as HTMLButtonElement
        holdAgentButtonEl.innerText = call._localHold ? 'UnHold' : 'Hold'
        holdAgentButtonEl.classList.add('holdAgent')
        let isOnHold = call._localHold
        holdAgentButtonEl.addEventListener('click', async (event) => {
            event.preventDefault()

            if (isOnHold) {
                await openSIPSJS.audio.unholdCall(call._id)
            } else {
                await openSIPSJS.audio.holdCall(call._id)
            }

            holdAgentButtonEl.innerText = !isOnHold ? 'UnHold' : 'Hold'
            isOnHold = !isOnHold
        })
        listItemEl.appendChild(holdAgentButtonEl)

        if (call.direction !== 'outgoing' && !call._is_confirmed) {
            const answerButtonEl = document.createElement('button') as HTMLButtonElement
            answerButtonEl.innerText = 'Answer'
            answerButtonEl.addEventListener('click', (event) => {
                event.preventDefault()
                openSIPSJS.audio.answerCall(call._id)
            })
            listItemEl.appendChild(answerButtonEl)
        }

        /* New functional */
        const callMoveSelectEl = document.createElement('select') as HTMLSelectElement

        const currentRoomMoveOption = document.createElement('option')
        currentRoomMoveOption.value = String(call.roomId)
        currentRoomMoveOption.text = `Room ${call.roomId}`
        callMoveSelectEl.appendChild(currentRoomMoveOption)

        Object.values(openSIPSJS.audio.getActiveRooms).forEach((room: IRoom) => {
            if (call.roomId === room.roomId) {
                return
            }

            const roomMoveOption = document.createElement('option')
            roomMoveOption.value = String(room.roomId)
            roomMoveOption.text = `Room ${room.roomId}`
            callMoveSelectEl.appendChild(roomMoveOption)
        })

        callMoveSelectEl.addEventListener('change', (event) => {
            event.preventDefault()

            const target = event.target as HTMLSelectElement
            openSIPSJS.audio.moveCall(call._id, parseInt(target.value))
        })
        listItemEl.appendChild(callMoveSelectEl)

        const indicatorSpanEl = document.createElement('span')
        indicatorSpanEl.setAttribute('id', `volume-level-${call._id}`)
        indicatorSpanEl.classList.add('volume-wrapper')

        const indicatorCanvasEl = document.createElement('canvas')
        indicatorCanvasEl.setAttribute('id', `canvas-${call._id}`)
        indicatorCanvasEl.width = 20
        indicatorCanvasEl.height = 20
        indicatorSpanEl.appendChild(indicatorCanvasEl)
        listItemEl.appendChild(indicatorSpanEl)

        if (call.audioTag?.srcObject) {
            runIndicator(call.audioTag.srcObject, call._id)
        }

        ulListEl.appendChild(listItemEl)
    })
}

const upsertMSRPMessagesData = (sessions: { [p: string]: IMessage }) => {
    messagesContainerEl.querySelectorAll('.messageWrapper').forEach(el => el.remove())

    const msrpTargetLabelEl = document.getElementById('msrpTargetLabel')
    if (msrpTargetLabelEl) {
        if (Object.keys(sessions).length) {
            msrpTargetLabelEl.style.display = 'none'
        } else {
            msrpTargetLabelEl.style.display = 'inline'
        }
    }


    Object.values(sessions).forEach(async (session) => {
        const messageEl = document.createElement('div')
        messageEl.setAttribute('id', `message-${session._id}`)
        messageEl.setAttribute('key', `${session._id}`)
        messageEl.classList.add('messageWrapper')

        const messageIdEl = document.createElement('b')
        messageIdEl.innerText = `Message ${session._id}`
        messageEl.appendChild(messageIdEl)

        if (session.direction !== 'outgoing' && session.status !== 'active') {
            const answerButtonEl = document.createElement('button') as HTMLButtonElement
            answerButtonEl.innerText = 'AnswerMsg'
            answerButtonEl.addEventListener('click', (event) => {
                event.preventDefault()
                openSIPSJS.audio.msrpAnswer(session._id)
                messageEl.removeChild(answerButtonEl)
                answerButtonEl.disabled = true
                answerButtonEl.style.display = 'none'
                //answerButtonEl.remove()
            })
            messageEl?.appendChild(answerButtonEl)
        }

        const terminateMsgButtonEl = document.createElement('button') as HTMLButtonElement
        terminateMsgButtonEl.innerText = 'Hangup'
        terminateMsgButtonEl.addEventListener('click', (event) => {
            event.preventDefault()
            openSIPSJS.messageTerminate(session._id)
        })
        messageEl.appendChild(terminateMsgButtonEl)

        const msgHistoryEl = document.createElement('div')
        msgHistoryEl.setAttribute('id', `history-${session._id}`)
        msgHistoryEl.classList.add('history-wrapper')
        messageEl.appendChild(msgHistoryEl)

        messagesContainerEl.appendChild(messageEl)

        const uid = getUIDFromSession(session)
        if (uid) {
            const records = await msrpHistoryDb.getData(uid)
            msgHistoryEl.querySelectorAll('.history-message').forEach(el => el.remove())
            records.forEach((record) => {
                upsertNewMSRPMessage({
                    message: record,
                    session: session
                })
            })
        }

    })
}

const upsertNewMSRPMessage = ({ message, session }: { message: MSRPMessage, session: MSRPSessionExtended }, saveToStorage = false) => {
    if (saveToStorage) {
        const uid = getUIDFromSession(session)
        msrpHistoryDb.saveData(message, uid)
    }

    const historyWrapper = document.getElementById(`history-${session._id}`)

    if (!historyWrapper) {
        return
    }

    const msgWrapperEl = document.createElement('div')
    if (message.direction === 'outgoing') {
        msgWrapperEl.classList.add('message-right')
    } else {
        msgWrapperEl.classList.add('message-left')
    }

    const msgEl = document.createElement('p')
    msgEl.innerText = message.body
    msgEl.classList.add('history-message')

    msgWrapperEl.appendChild(msgEl)
    historyWrapper.appendChild(msgWrapperEl)

    // Scroll to the newest message
    historyWrapper.scrollTop = historyWrapper.scrollHeight
}

/* DOMContentLoaded Listener */

window.addEventListener('DOMContentLoaded', () => {
    if (muteContainerEl) {
        muteContainerEl.querySelector('button').addEventListener('click', muteButtonEventListener)
    }

    if (addToCurrentRoomInputEl) {
        addToCurrentRoomInputEl.addEventListener(
            'change',
            async (event) => {
                event.preventDefault()

                const target = event.target as HTMLInputElement
                addCallToCurrentRoom = target.checked
            })
    }

    if (onHoldWhenAddCallInputEl) {
        onHoldWhenAddCallInputEl.addEventListener(
            'change',
            async (event) => {
                event.preventDefault()

                const target = event.target as HTMLInputElement
                onHoldWhenAddCall = target.checked
            })
    }
})

/* DOM Elements Listeners */

loginToAppFormEl?.addEventListener('submit', (event) => {
    event.preventDefault()

    const form = event.target
    if (!(form instanceof HTMLFormElement)) {
        return
    }

    const urlParams = new URLSearchParams(window.location.search)
    const formData = new FormData(form)

    const username = formData.get('username') || urlParams.get('username')

    const password = (formData.get('password') || urlParams.get('password')) as string
    const token = (formData.get('token') || urlParams.get('token')) as string

    const domain = formData.get('domain') || urlParams.get('domain')

    const useAudio = formData.get('useAudioCheckbox') || urlParams.get('useAudio')
    const useVideo = formData.get('useVideoCheckbox') || urlParams.get('useVideo')

    if (username && domain && (!password && !token)) {
        alert('Fill up password or token')
        return
    }
    if (!username || (!password && !token) || !domain) {
        alert('Fill up all required fields')
        return
    }

    const pnparamsString = formData.get('pnparams') as string

    const pnParams = pnparamsString.split(';').reduce(
        (acc, item) => {
            if (typeof item !== 'string') {
                return acc
            }

            const [ key, value ] = item.split('=')

            if (typeof key !== 'string' || typeof value !== 'string') {
                return acc
            }

            acc[key] = value

            return acc
        },
        {}
    )

    try {
        const configuration: IOpenSIPSConfiguration = {
            session_timers: false,
            uri: `sip:${username}@${domain}`,
            overrideUserAgent: (userAgent) => userAgent + ' Vue 3.0'
        }

        if (password) {
            configuration.password = password
        }

        if (token) {
            configuration.authorization_jwt = token
        }

        const modules = []

        if (useAudio === 'on') {
            modules.push(MODULES.AUDIO)
        }

        if (useVideo === 'on') {
            modules.push(MODULES.VIDEO)
        }

        openSIPSJS = new OpenSIPSJS({
            configuration,
            socketInterfaces: [ `wss://${domain}` ],
            pnExtraHeaders: pnParams,
            sipDomain: `${domain}`,
            sipOptions: {
                session_timers: false,
                extraHeaders: [ 'X-Bar: bar' ],
                pcConfig: {}
                /*pcConfig: {
                    iceServers: [ { urls: 'stun:stun.l.google.com:19302' } ]
                },*/
            },
            modules
        })

        const screenSharePlugin = new ScreenSharePlugin()

        const screenShareWhiteBoardPlugin = new ScreenShareWhiteBoardPlugin(screenSharePlugin)

        /*const streamMaskPlugin = new StreamMaskPlugin({
            //effect: 'backgroundImageEffect',
            effect: 'bokehEffect',
            //base64Image: base64Image
        }, {
            immediate: false
        })*/

        const whiteBoardPlugin = new WhiteBoardPlugin({
            mode: 'imageWhiteboard',
            imageSrc: base64Image
        })

        openSIPSJS.use(screenSharePlugin)
        //openSIPSJS.use(streamMaskPlugin)
        openSIPSJS.use(whiteBoardPlugin)
        openSIPSJS.use(screenShareWhiteBoardPlugin)

        /* openSIPSJS Listeners */
        openSIPSJS
            .on('connection', () => {
                if (!muteContainerEl) {
                    return
                }

                muteContainerEl.querySelector('button').setAttribute('disabled', 'true')
                addToCurrentRoomInputEl.checked = false
                msrpHistoryDb = new IndexedDBService('msrpHistory', 6)
                msrpHistoryDb.connect()
            })
            .on('changeActiveCalls', (sessions) => {
                console.log('sessions', sessions)
                calculateDtmfButtonDisability(sessions)
                calculateMuteButtonDisability(sessions)
                calculateAgentVolumeLevel(sessions)
                calculateActiveCallsNumber(sessions)
                Object.values(openSIPSJS.audio.getActiveRooms).forEach((room: IRoom) => {
                    upsertRoomData(room, sessions)
                })
            })
            .on('changeActiveMessages', (sessions: { [p: string]: IMessage }) => {
                upsertMSRPMessagesData(sessions)
            })
            .on('newMSRPMessage', (msg: { message: MSRPMessage, session: MSRPSessionExtended }) => {
                upsertNewMSRPMessage(msg, true)
            })
            .on('callAddingInProgressChanged', (value) => {
                if (!callAddingIndicatorEl) {
                    return
                }

                if (value === undefined) {
                    callAddingIndicatorEl.classList.add('hidden')
                    makeCallFormEl?.querySelector('button[type="submit"]').removeAttribute('disabled')
                } else {
                    callAddingIndicatorEl.classList.remove('hidden')
                    makeCallFormEl?.querySelector('button[type="submit"]').setAttribute('disabled', 'true')
                }
            })
            .on('changeAvailableDeviceList', (devices: Array<MediaDeviceInfo>) => {
                const inputDevices = devices.filter(d => d.kind === 'audioinput')
                const outputDevices = devices.filter(d => d.kind === 'audiooutput')

                // Update microphone device options list
                if (microphoneEl) {
                    while (microphoneEl.childNodes.length >= 1) {
                        microphoneEl.removeChild(microphoneEl.firstChild)
                    }

                    inputDevices.forEach((d) => {
                        const newOption = document.createElement('option')
                        newOption.value = d.deviceId
                        newOption.text = d.label
                        microphoneEl.appendChild(newOption)
                    })
                }

                // Update speaker device options list
                if (speakerEl) {
                    while (speakerEl.childNodes.length >= 1) {
                        speakerEl.removeChild(speakerEl.firstChild)
                    }

                    outputDevices.forEach((d) => {
                        const newOption = document.createElement('option')
                        newOption.value = d.deviceId
                        newOption.text = d.label
                        speakerEl.appendChild(newOption)
                    })
                }
            })
            .on('changeActiveInputMediaDevice', (data: string) => {
                if (microphoneEl) {
                    microphoneEl.value = data
                }
            })
            .on('changeActiveOutputMediaDevice', (data: string) => {
                if (speakerEl) {
                    speakerEl.value = data
                }
            })
            .on('changeMuteWhenJoin', (value: boolean) => {
                if (muteWhenJoinInputEl) {
                    muteWhenJoinInputEl.checked = value
                }
            })
            .on('changeIsDND', (value: boolean) => {
                if (DNDInputEl) {
                    DNDInputEl.checked = value
                }
            })
            .on('changeIsMuted', (value: boolean) => {
                if (!muteContainerEl) {
                    return
                }

                muteContainerEl.removeChild(muteContainerEl.querySelector('button'))
                const buttonEl = document.createElement('button') as HTMLButtonElement
                const buttonText = value ? 'Unmute' : 'Mute'
                buttonEl.classList.add('muteButtonEl')
                buttonEl.innerText = buttonText
                buttonEl.addEventListener('click', muteButtonEventListener)
                muteContainerEl.appendChild(buttonEl)
            })
            .on('changeActiveStream', (value: MediaStream) => {
                runIndicator(value, 'agent-voice-level')
            })
            .on('changeCallVolume', (data: ChangeVolumeEventType) => {
                //console.log('DEMO', data.callId, data.volume)
            })
            .on('currentActiveRoomChanged', (id: number | undefined) => {
                roomsContainerEl.querySelectorAll('.roomWrapper').forEach((el) => {
                    const elRoomId = +el.id.split('-')[1]
                    el.querySelectorAll('.holdAgent').forEach((btnEl) => {
                        if (elRoomId === id) {
                            btnEl.removeAttribute('disabled')
                        } else {
                            btnEl.setAttribute('disabled', '')
                        }
                    })
                })

                const options = roomSelectEl.querySelectorAll('option')
                options.forEach(option => option.removeAttribute('selected'))

                if (!id) {
                    const noDataOption = roomSelectEl.querySelector('option.noData')
                    noDataOption.setAttribute('selected', '')
                    return
                }

                options.forEach(option => {
                    if (option.value === `${id}`) {
                        option.setAttribute('selected', '')
                    }
                })
            })
            .on('addRoom', ({ roomList }: RoomChangeEmitType) => {
                updateRoomListOptions(roomList)
            })
            .on('updateRoom', ({ roomList }: RoomChangeEmitType) => {
                updateRoomListOptions(roomList)
            })
            .on('removeRoom', ({ roomList }: RoomChangeEmitType) => {
                updateRoomListOptions(roomList)
            })
            .on('changeCallTime', (callTime: CallTime) => {
                Object.values(callTime).forEach(call => {
                    const callTimerEl = document.getElementById(buildCallTimerElementID(call.callId))

                    if (callTimerEl) {
                        callTimerEl.innerText = `${call.formatted}`
                    }
                })
            })
            .on('conferenceStart', async () => {
                videoCallFormEl.style.display = 'none'

                const devices = await navigator.mediaDevices.enumerateDevices()

                const audioInputDevices = devices.filter(d => d.kind === 'audioinput')
                const videoInputDevices = devices.filter(d => d.kind === 'videoinput')
                const audioOutputDevices = devices.filter(d => d.kind === 'audiooutput')

                if (microphoneVideoEl) {
                    while (microphoneVideoEl.childNodes.length >= 1) {
                        microphoneVideoEl.removeChild(microphoneVideoEl.firstChild)
                    }

                    audioInputDevices.forEach((d) => {
                        const newOption = document.createElement('option')
                        newOption.value = d.deviceId
                        newOption.text = d.label
                        microphoneVideoEl.appendChild(newOption)
                    })
                }

                if (cameraVideoEl) {
                    while (cameraVideoEl.childNodes.length >= 1) {
                        cameraVideoEl.removeChild(cameraVideoEl.firstChild)
                    }

                    videoInputDevices.forEach((d) => {
                        const newOption = document.createElement('option')
                        newOption.value = d.deviceId
                        newOption.text = d.label
                        cameraVideoEl.appendChild(newOption)
                    })
                }

                if (speakerVideoEl) {
                    while (speakerVideoEl.childNodes.length >= 1) {
                        speakerVideoEl.removeChild(speakerVideoEl.firstChild)
                    }

                    audioOutputDevices.forEach((d) => {
                        const newOption = document.createElement('option')
                        newOption.value = d.deviceId
                        newOption.text = d.label
                        speakerVideoEl.appendChild(newOption)
                    })
                }
            })
            .on('conferenceEnd', () => {
                videoCallFormEl.style.display = 'block'
            })
            .on('changeMainVideoStream', ({ name, stream }) => {
                const videoContainer = document.getElementById('mainVideoElementContainer')

                const removeVideoElement = () => {
                    const mainVideoElement = videoContainer.querySelector('video')
                    const mainVideoNameElement = videoContainer.querySelector('#main-video-name')
                    if (mainVideoElement) {
                        mainVideoElement.remove()
                    }

                    if (mainVideoNameElement) {
                        mainVideoNameElement.remove()
                    }
                }

                removeVideoElement()

                if (!stream) {
                    removeVideoElement()
                    return
                }

                const nameElement = document.createElement('div')
                nameElement.setAttribute('id', 'main-video-name')
                nameElement.innerText = name

                const videoElement = document.createElement('video')
                videoElement.setAttribute('id', 'main-video-id')
                videoElement.setAttribute('autoplay', '')
                videoElement.setAttribute('controls', '')
                videoElement.classList.add('main-video')
                videoElement.style.height = '95%'
                videoElement.srcObject = stream

                videoContainer.appendChild(videoElement)
                videoContainer.appendChild(nameElement)
            })
            .on('startScreenShare', ({ stream }) => {
                screenShareButtonEl.innerText = 'Stop Screen Share'
                screenShareWhiteboardButtonEl.style.display = 'block'

                const videoContainer = document.getElementById('mainVideoElementContainer')

                const removeVideoElement = () => {
                    const mainVideoElement = videoContainer.querySelector('video')
                    const mainVideoNameElement = videoContainer.querySelector('#main-video-name')
                    if (mainVideoElement) {
                        mainVideoElement.remove()
                    }

                    if (mainVideoNameElement) {
                        mainVideoNameElement.remove()
                    }
                }

                removeVideoElement()

                if (!stream) {
                    removeVideoElement()
                    return
                }

                const nameElement = document.createElement('div')
                nameElement.setAttribute('id', 'main-video-name')
                nameElement.innerText = 'Screen Share'

                const videoElement = document.createElement('video')
                videoElement.setAttribute('id', 'main-video-id')
                videoElement.setAttribute('autoplay', '')
                videoElement.setAttribute('controls', '')
                videoElement.classList.add('main-video')
                videoElement.style.height = '95%'
                videoElement.srcObject = stream

                videoContainer.appendChild(videoElement)
                videoContainer.appendChild(nameElement)
            })
            .on('stopScreenShare', () => {
                screenShareButtonEl.innerText = 'Start Screen Share'
                screenShareWhiteboardButtonEl.style.display = 'none'
            })
            /*.on('startBlur', () => {
                console.log('startBlur')
                blurButtonEl.innerText = 'Stop Blur'
            })
            .on('stopBlur', () => {
                console.log('stopBlur')
                blurButtonEl.innerText = 'Start Blur'
            })*/
            .on('startWhiteboard', () => {
                whiteboardButtonEl.innerText = 'Stop Whiteboard'
            })
            .on('stopWhiteboard', () => {
                whiteboardButtonEl.innerText = 'Start Whiteboard'
            })
            .on('memberJoin', (data) => {
                const videosContainer = document.getElementById('participantsVideoElements')

                const id = data.id

                const members = videosContainer.querySelectorAll(`#member-${id}`)

                if (!members.length) {
                    const videoElementContainer = document.createElement('div')
                    videoElementContainer.setAttribute('id', `member-${id}`)

                    const memberNameElement = document.createElement('div')
                    memberNameElement.innerText = data.name

                    const videoElement = document.createElement('video')
                    videoElement.setAttribute('autoplay', '')
                    videoElement.setAttribute('controls', '')
                    videoElement.style.width = '40%'
                    videoElement.srcObject = data.stream

                    videoElementContainer.appendChild(videoElement)
                    videoElementContainer.appendChild(memberNameElement)
                    videosContainer.appendChild(videoElementContainer)
                } else {
                    throw new Error(`Member with id="member-${id}" already exists`)
                }
            })
            .on('memberHangup', (data) => {
                const videosContainer = document.getElementById('participantsVideoElements')

                const id = data.id

                const member = videosContainer.querySelector(`#member-${id}`)

                member?.remove()
            })
            .on('changeAudioState', (state) => {
                audioChangeButtonEl.innerText = state ? 'Audio On' : 'Audio Off'
            })
            .on('changeVideoState', (state) => {
                videoChangeButtonEl.innerText = state ? 'Video On' : 'Video Off'
            })
            .begin()

        openSIPSJS.subscribe(
            'new_call',
            (e) => {
                console.log('[SUBSCRIBE] NEW_CALL', e)
            }
        )

        openSIPSJS.subscribe(
            'confirmed',
            (e) => {
                console.log('[SUBSCRIBE] CALL_CONFIRMED', e)
            }
        )

        openSIPSJS.subscribe(
            'failed',
            (e) => {
                console.log('[SUBSCRIBE] CALL_FAILED', e)
            }
        )

        openSIPSJS.subscribe(
            'ended',
            (e) => {
                console.log('[SUBSCRIBE] ENDED', e)
            }
        )

        /*setTimeout(() => {
            openSIPSJS.video.startJanus('abcd')
        }, 5000)*/

        const navigationTabs = document.getElementsByClassName('navigation-tab')[0]

        modules.forEach((module, index) => {
            const tabButton = document.createElement('button')
            tabButton.classList.add('tablinks')

            if (module === MODULES.AUDIO) {
                tabButton.setAttribute('id', 'audioTabButton')
                tabButton.innerText = 'Audio'

                tabButton.addEventListener('click', (event) => {
                    event.preventDefault()
                    selectTab(event, 'audioTabContainer')
                })

                navigationTabs.appendChild(tabButton)

                if (index === 0) {
                    tabButton.click()
                }
            } else if (module === MODULES.VIDEO) {
                tabButton.setAttribute('id', 'videoTabButton')
                tabButton.innerText = 'Video'

                tabButton.addEventListener('click', (event) => {
                    event.preventDefault()
                    selectTab(event, 'videoTabContainer')
                })

                navigationTabs.appendChild(tabButton)

                if (index === 0) {
                    tabButton.click()
                }
            }
        })

        loginPageEl.style.display = 'none'
        webRTCPageEl.style.display = 'block'
    } catch (e) {
        console.error(e)
    }
})

audioChangeButtonEl?.addEventListener('click', (event) => {
    event.preventDefault()

    if (audioChangeButtonEl.innerText === 'Audio On') {
        openSIPSJS.video.stopAudio()
    } else {
        openSIPSJS.video.startAudio()
    }

})

videoChangeButtonEl?.addEventListener('click', (event) => {
    event.preventDefault()

    if (videoChangeButtonEl.innerText === 'Video On') {
        openSIPSJS.video.stopVideo()
    } else {
        openSIPSJS.video.startVideo()
    }
})

screenShareButtonEl?.addEventListener('click', (event) => {
    event.preventDefault()

    //openSIPSJS.video.startScreenShare()
    if (screenShareButtonEl.innerText === 'Start Screen Share') {
        openSIPSJS.getPlugin('ScreenShare').connect({})
    } else {
        openSIPSJS.getPlugin('ScreenShare').kill()
    }
})

/*screenShareWhiteboardButtonEl?.addEventListener('click', (event) => {
    event.preventDefault()

    if (screenShareButtonEl.innerText === 'Start Screen Share') {
        openSIPSJS.getPlugin('ScreenSharePlugin').connect({})
    } else {
        openSIPSJS.getPlugin('ScreenSharePlugin').kill()
    }
})*/

blurButtonEl?.addEventListener('click', (event) => {
    event.preventDefault()

    if (blurButtonEl.innerText === 'Start Blur') {
        //openSIPSJS.video.startBlur()
        openSIPSJS.getPlugin('StreamMask').connect()
        blurButtonEl.innerText = 'Stop Blur'
    } else {
        openSIPSJS.getPlugin('StreamMask').kill()
        blurButtonEl.innerText = 'Start Blur'
    }
})

whiteboardButtonEl?.addEventListener('click', (event) => {
    event.preventDefault()

    const videoContainer = document.getElementById('mainVideoElementContainer')

    const mainVideoElement = videoContainer.querySelector('#main-video-id')

    if (whiteboardButtonEl.innerText === 'Start Whiteboard') {
        mainVideoElement.style.display = 'none'

        const presentationVideoContainer = document.createElement('div')
        presentationVideoContainer.setAttribute('id', 'presentation-video-container')
        presentationVideoContainer.classList.add('main-video')

        const presentationCanvasWrapper = document.createElement('div')
        presentationCanvasWrapper.setAttribute('id', 'presentationCanvasWrapper')

        presentationVideoContainer.appendChild(presentationCanvasWrapper)
        videoContainer.appendChild(presentationVideoContainer)

        openSIPSJS.getPlugin('WhiteBoard').connect()
        whiteboardButtonEl.innerText = 'Stop Whiteboard'
    } else {
        const presentationVideoContainer = videoContainer.querySelector('#presentation-video-container')

        if (presentationVideoContainer) {
            presentationVideoContainer.remove()
        }

        mainVideoElement.style.display = 'block'

        openSIPSJS.getPlugin('WhiteBoard').kill()
        whiteboardButtonEl.innerText = 'Start Whiteboard'
    }
})

screenShareWhiteboardButtonEl?.addEventListener('click', (event) => {
    event.preventDefault()

    const videoContainer = document.getElementById('mainVideoElementContainer')

    const mainVideoElement = videoContainer.querySelector('#main-video-id')

    if (!mainVideoElement) {
        console.error('mainVideoElement is missing')
        return
    }

    if (screenShareWhiteboardButtonEl.innerText === 'Start Screen Share Whiteboard') {
        mainVideoElement.style.display = 'none'

        const screenShareVideoContainer = document.createElement('div')
        screenShareVideoContainer.setAttribute('id', 'screen-share-video-container')
        screenShareVideoContainer.classList.add('main-video')
        screenShareVideoContainer.style.display = 'flex'
        screenShareVideoContainer.style.justifyContent = 'center'
        screenShareVideoContainer.style.position = 'relative'

        const compositeCanvasWrapper = document.createElement('div')
        compositeCanvasWrapper.setAttribute('id', 'composite-canvas-container')
        compositeCanvasWrapper.style.position = 'relative'

        const compositeCanvasElement = document.createElement('canvas')
        compositeCanvasElement.setAttribute('id', 'composite-canvas')

        const containerElement = document.createElement('div')
        containerElement.setAttribute('id', 'container')
        containerElement.style.display = 'flex'
        containerElement.style.alignItems = 'center'

        compositeCanvasWrapper.appendChild(compositeCanvasElement)
        screenShareVideoContainer.appendChild(compositeCanvasWrapper)
        screenShareVideoContainer.appendChild(containerElement)

        videoContainer.appendChild(screenShareVideoContainer)

        openSIPSJS.getPlugin('ScreenShareWhiteboard').connect()
        screenShareWhiteboardButtonEl.innerText = 'Stop Screen Share Whiteboard'
    } else {
        const screenShareVideoContainer = videoContainer.querySelector('#screen-share-video-container')

        if (screenShareVideoContainer) {
            screenShareVideoContainer.remove()
        }

        mainVideoElement.style.display = 'block'

        openSIPSJS.getPlugin('ScreenShareWhiteboard').kill()
        screenShareWhiteboardButtonEl.innerText = 'Start Screen Share Whiteboard'
    }
})

makeCallFormEl?.addEventListener(
    'submit',
    (event) => {
        event.preventDefault()

        const form = event.target

        if (!(form instanceof HTMLFormElement)) {
            return
        }

        const formData = new FormData(form)
        const target = formData.get('target')

        if (typeof target !== 'string' || target.length === 0) {
            alert('Please provide a valid string!')

            return
        }

        openSIPSJS.audio?.initCall(target, addCallToCurrentRoom, onHoldWhenAddCall)
    }
)

videoCallFormEl?.addEventListener(
    'submit',
    (event) => {
        event.preventDefault()

        const form = event.target

        if (!(form instanceof HTMLFormElement)) {
            return
        }

        const formData = new FormData(form)
        const target = formData.get('target')
        const name = formData.get('name')

        if (typeof target !== 'string' || target.length === 0) {
            alert('Please provide a valid string target!')

            return
        }

        if (typeof name !== 'string' || name.length === 0) {
            alert('Please provide a valid string name!')

            return
        }

        openSIPSJS.video?.initCall(target, name)
    }
)

terminateJanusSessionButtonEl?.addEventListener(
    'click',
    (event) => {
        event.preventDefault()

        openSIPSJS.video?.stop()

        const videoContainer = document.getElementById('mainVideoElementContainer')

        const mainVideoElement = videoContainer.querySelector('video')
        mainVideoElement.classList.add('main-video')
        mainVideoElement.setAttribute('id', 'main-video-id')
        mainVideoElement.setAttribute('controls', 'false')

        const usernameElement = videoContainer.querySelector('div')

        mainVideoElement?.remove()
        usernameElement?.remove()
    })

sendMessageFormEl?.addEventListener(
    'submit',
    (event) => {
        event.preventDefault()

        const form = event.target

        if (!(form instanceof HTMLFormElement)) {
            return
        }

        const activeMSRPSessionLength = Object.keys(openSIPSJS.msrp.getActiveMessages).length

        const formData = new FormData(form)
        let target
        if (!activeMSRPSessionLength) {
            target = formData.get('target')
        }

        const message = formData.get('message')
        const extraHeaders = formData.get('extraHeaders')

        if (!activeMSRPSessionLength && (typeof target !== 'string' || target.length === 0)) {
            alert('Please provide a valid string!')

            return
        }

        const optionsObj: SendMessageOptions = {}

        if (typeof extraHeaders ==='string') {
            optionsObj.extraHeaders = extraHeaders.split(',')
        }

        if (activeMSRPSessionLength) {
            const msrpSession = Object.values(openSIPSJS.msrp.getActiveMessages)[0] as IMessage
            openSIPSJS.msrp.sendMSRP(msrpSession._id, message)
        } else {
            openSIPSJS.msrp.initMSRP(
                target,
                message,
                optionsObj
            )
        }

    }
)

microphoneEl?.addEventListener(
    'change',
    async (event) => {
        event.preventDefault()

        const target = event.target as HTMLSelectElement
        await openSIPSJS.audio.setMicrophone(target.value)
    })

speakerEl?.addEventListener(
    'change',
    async (event) => {
        event.preventDefault()

        const target = event.target as HTMLSelectElement
        await openSIPSJS.audio.setSpeaker(target.value)
    })

async function processMediaConstraintsChange () {
    const mediaConstraints: MediaStreamConstraints = {
        audio: true,
        video: true
    }

    if (audioInputDeviceId) {
        mediaConstraints.audio = {
            deviceId: {
                exact: audioInputDeviceId
            }
        }
    }

    if (videoInputDeviceId) {
        mediaConstraints.video = {
            deviceId: {
                exact: videoInputDeviceId
            }
        }
    }
    console.log('mediaConstraints', mediaConstraints)
    await openSIPSJS.video.changeMediaConstraints(mediaConstraints)
}

microphoneVideoEl?.addEventListener(
    'change',
    async (event) => {
        event.preventDefault()

        const target = event.target as HTMLSelectElement
        console.log('microphoneVideoEl target', target.value)
        audioInputDeviceId = target.value

        processMediaConstraintsChange()
    })

cameraVideoEl?.addEventListener(
    'change',
    async (event) => {
        event.preventDefault()

        const target = event.target as HTMLSelectElement
        console.log('cameraVideoEl target', target.value)
        videoInputDeviceId = target.value
        //await openSIPSJS.audio.setMicrophone(target.value)

        processMediaConstraintsChange()
    })

speakerVideoEl?.addEventListener(
    'change',
    async (event) => {
        event.preventDefault()

        const target = event.target as HTMLSelectElement
        console.log('speakerVideoEl target', target.value)
        audioOutputDeviceId = target.value

        const videoElements = document.querySelectorAll('video')
        if (audioOutputDeviceId && videoElements.length) {
            videoElements.forEach((element) => {
                if (!element || !audioOutputDeviceId) {
                    return
                }

                if (typeof element.sinkId !== 'undefined') {
                    try {
                        element.setSinkId(audioOutputDeviceId)
                        console.log(`Success, audio output device attached: ${audioOutputDeviceId}`)
                    } catch (error) {
                        let errorMessage = error
                        if (error.name === 'SecurityError') {
                            errorMessage = `You need to use HTTPS for selecting audio output device: ${error}`
                        }
                        console.error(errorMessage)
                    }
                } else {
                    console.warn('Browser does not support output device selection.')
                }
                //DeviceManager.changeAudioOutput(element, settingsModel.value.audioOutput)
            })

            /*await nextTick(() => {
                videoElements.forEach(element => {
                    DeviceManager.changeAudioOutput(element, settingsModel.value.audioOutput)
                })
            })*/
        }
        //await openSIPSJS.audio.setMicrophone(target.value)
    })

muteWhenJoinInputEl?.addEventListener(
    'change',
    async (event) => {
        event.preventDefault()

        const target = event.target as HTMLInputElement
        openSIPSJS.audio.setMuteWhenJoin(target.checked)

    })

DNDInputEl?.addEventListener(
    'change',
    async (event) => {
        event.preventDefault()

        const target = event.target as HTMLInputElement
        openSIPSJS.audio.isDND = target.checked

    })

inputLevelApplyButtonEl?.addEventListener(
    'click',
    async (event) => {
        event.preventDefault()

        const value = Number(inputLevelEl.value)
        openSIPSJS.audio.setMicrophoneSensitivity(value)
    })

outputLevelApplyButtonEl?.addEventListener(
    'click',
    async (event) => {
        event.preventDefault()

        const value = Number(outputLevelEl.value)
        openSIPSJS.audio.setSpeakerVolume(value)
    })


dtmfInputEl?.addEventListener(
    'input',
    async (event) => {
        event.preventDefault()

        calculateDtmfButtonDisability(openSIPSJS.audio.getActiveCalls)
    })

dtmfForm?.addEventListener(
    'submit',
    (event) => {
        event.preventDefault()
        const form = event.target

        if (!(form instanceof HTMLFormElement)) {
            return
        }

        const callsInActiveRoom = (Object.values(openSIPSJS.audio.getActiveCalls) as Array<ICall>)
            .filter((call) => call.roomId === openSIPSJS.audio.currentActiveRoomId)

        const dtmfTarget = dtmfInputEl.value

        openSIPSJS.audio.sendDTMF(callsInActiveRoom[0]._id, dtmfTarget)
    })

roomSelectEl?.addEventListener(
    'change',
    async (event) => {
        event.preventDefault()

        const target = event.target as HTMLSelectElement
        const parsedValue = parseInt(target.value)
        const roomId = isNaN(parsedValue) ? undefined: parsedValue
        await openSIPSJS.audio.setActiveRoom(roomId)
    })

logoutButtonEl?.addEventListener(
    'click',
    (event) => {
        event.preventDefault()
        openSIPSJS.unregister()

        window.location.reload()
    }
)

